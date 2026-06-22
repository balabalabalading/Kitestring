import { getBundleType, getVersion, BundleType } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { open } from "@tauri-apps/plugin-shell";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { getLatestReleaseNote, getReleaseNote, type ReleaseNote } from "../lib/releaseNotes";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { useToast } from "../components/ui/Toast";

type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "installing" | "error";

interface UpdateContextValue {
  currentVersion: string;
  availableVersion: string | null;
  phase: UpdatePhase;
  progress: number | null;
  error: string | null;
  canAutoInstall: boolean;
  hasCurrentReleaseNote: boolean;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  openWhatsNew: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);
const LAST_RUN_VERSION_KEY = "kitestring-last-run-version";
const PENDING_UPDATE_VERSION_KEY = "kitestring-pending-update-version";
const RELEASE_URL = "https://github.com/balabalabalading/Kitestring/releases/latest";

export function useAppUpdate() {
  const context = useContext(UpdateContext);
  if (!context) throw new Error("useAppUpdate must be used within UpdateProvider");
  return context;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const { showToast } = useToast();
  const [currentVersion, setCurrentVersion] = useState(getLatestReleaseNote().version);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canAutoInstall, setCanAutoInstall] = useState(true);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const updateRef = useRef<Update | null>(null);
  const checkRunRef = useRef(0);
  const checkBusyRef = useRef(false);
  const installBusyRef = useRef(false);

  const closeUpdateResource = useCallback(async () => {
    const update = updateRef.current;
    updateRef.current = null;
    if (update) await update.close().catch(() => undefined);
  }, []);

  const showAvailableToast = useCallback((version: string) => {
    showToast(t("update.availableToast", { version }), "info", {
      persistent: true,
      dedupeKey: `app-update:${version}`,
      action: {
        label: t("update.view"),
        onClick: () => setUpdateDialogOpen(true),
      },
    });
  }, [showToast, t]);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (checkBusyRef.current || installBusyRef.current) return;
    checkBusyRef.current = true;
    const runId = ++checkRunRef.current;
    setPhase("checking");
    setError(null);
    try {
      const bundleType = await getBundleType();
      const supportsInstall = bundleType !== BundleType.Deb && bundleType !== BundleType.Rpm;
      setCanAutoInstall(supportsInstall);
      await closeUpdateResource();
      const update = await check({ timeout: 15_000 });
      if (runId !== checkRunRef.current) {
        await update?.close();
        return;
      }
      updateRef.current = update;
      if (!update) {
        setAvailableVersion(null);
        setPhase("idle");
        if (manual) showToast(t("update.upToDate"));
        return;
      }
      setAvailableVersion(update.version);
      setPhase("available");
      if (manual) setUpdateDialogOpen(true);
      else showAvailableToast(update.version);
    } catch (nextError) {
      if (runId !== checkRunRef.current) return;
      const message = String(nextError);
      setError(message);
      setPhase("error");
      if (manual) showToast(t("update.checkFailed"), "error");
      else console.error("Silent update check failed:", nextError);
    } finally {
      checkBusyRef.current = false;
    }
  }, [closeUpdateResource, showAvailableToast, showToast, t]);

  const installUpdate = useCallback(async () => {
    if (checkBusyRef.current || installBusyRef.current) return;
    const update = updateRef.current;
    if (!update || !canAutoInstall) {
      await open(RELEASE_URL);
      return;
    }
    installBusyRef.current = true;
    localStorage.setItem(PENDING_UPDATE_VERSION_KEY, update.version);
    setPhase("downloading");
    setProgress(0);
    setError(null);
    let downloaded = 0;
    let total: number | undefined;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event === "Progress" && total) {
          setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
        }
        if (event.event === "Finished") {
          setProgress(100);
          setPhase("installing");
        }
      });
      setPhase("installing");
      await relaunch();
    } catch (nextError) {
      localStorage.removeItem(PENDING_UPDATE_VERSION_KEY);
      setError(String(nextError));
      setPhase("error");
      installBusyRef.current = false;
    }
  }, [canAutoInstall]);

  const closeWhatsNew = useCallback(() => {
    localStorage.setItem(LAST_RUN_VERSION_KEY, currentVersion);
    localStorage.removeItem(PENDING_UPDATE_VERSION_KEY);
    setWhatsNewOpen(false);
  }, [currentVersion]);

  useEffect(() => {
    let active = true;
    void getVersion().then((version) => {
      if (!active) return;
      setCurrentVersion(version);
      const lastRunVersion = localStorage.getItem(LAST_RUN_VERSION_KEY);
      const pendingVersion = localStorage.getItem(PENDING_UPDATE_VERSION_KEY);
      const shouldShowWhatsNew = pendingVersion === version || (lastRunVersion && lastRunVersion !== version);
      if (shouldShowWhatsNew && getReleaseNote(version)) {
        setWhatsNewOpen(true);
      } else if (shouldShowWhatsNew) {
        localStorage.setItem(LAST_RUN_VERSION_KEY, version);
        localStorage.removeItem(PENDING_UPDATE_VERSION_KEY);
      } else if (!lastRunVersion) {
        localStorage.setItem(LAST_RUN_VERSION_KEY, version);
      }
    }).catch((nextError) => console.error("Failed to read app version:", nextError));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdates(false), 1800);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { void closeUpdateResource(); }, [closeUpdateResource]);

  const openWhatsNew = useCallback(() => setWhatsNewOpen(true), []);
  const currentReleaseNote = getReleaseNote(currentVersion);
  const value = useMemo<UpdateContextValue>(() => ({
    currentVersion,
    availableVersion,
    phase,
    progress,
    error,
    canAutoInstall,
    hasCurrentReleaseNote: Boolean(currentReleaseNote),
    checkForUpdates,
    openWhatsNew,
  }), [availableVersion, canAutoInstall, checkForUpdates, currentReleaseNote, currentVersion, error, openWhatsNew, phase, progress]);

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <UpdateDialog
        open={updateDialogOpen}
        onClose={() => {
          if (phase !== "downloading" && phase !== "installing") setUpdateDialogOpen(false);
        }}
        currentVersion={currentVersion}
        availableVersion={availableVersion}
        canAutoInstall={canAutoInstall}
        phase={phase}
        progress={progress}
        error={error}
        onInstall={() => void installUpdate()}
        onOpenRelease={() => void open(RELEASE_URL)}
      />
      <WhatsNewDialog
        open={whatsNewOpen && Boolean(currentReleaseNote)}
        release={currentReleaseNote}
        locale={locale}
        onClose={closeWhatsNew}
      />
    </UpdateContext.Provider>
  );
}

function UpdateDialog({ open: isOpen, onClose, currentVersion, availableVersion, canAutoInstall, phase, progress, error, onInstall, onOpenRelease }: {
  open: boolean;
  onClose: () => void;
  currentVersion: string;
  availableVersion: string | null;
  canAutoInstall: boolean;
  phase: UpdatePhase;
  progress: number | null;
  error: string | null;
  onInstall: () => void;
  onOpenRelease: () => void;
}) {
  const { t } = useI18n();
  const busy = phase === "downloading" || phase === "installing";
  return (
    <Dialog open={isOpen} onClose={onClose} width="w-[440px] max-w-[calc(100vw-2rem)]">
      <div className="h-[3px] shrink-0 bg-[var(--gradient-thread)]" />
      <div className="px-6 py-5 flex flex-col gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent-sky">Kitestring Update</div>
          <h3 className="mt-1 text-[18px] font-semibold text-text-primary">{t("update.dialogTitle")}</h3>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-base px-4 py-3">
          <span className="font-mono text-[12px] text-text-tertiary">v{currentVersion}</span>
          <span className="h-px flex-1 bg-gradient-to-r from-border-default to-accent-sky" />
          <span className="font-mono text-[13px] font-semibold text-accent-sky">v{availableVersion ?? "—"}</span>
        </div>
        {!canAutoInstall && <p className="text-[12px] leading-5 text-text-secondary">{t("update.manualInstallHint")}</p>}
        {busy && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[11px] text-text-tertiary">
              <span>{phase === "installing" ? t("update.installing") : t("update.downloading")}</span>
              {progress !== null && <span>{progress}%</span>}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-bg-elevated">
              <div className="h-full bg-[var(--gradient-thread)] transition-[width] duration-200" style={{ width: `${progress ?? 20}%` }} />
            </div>
          </div>
        )}
        {error && <div className="rounded-sm bg-status-broken/8 px-3 py-2 text-[11px] text-status-broken">{t("update.installFailed")}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>{t("update.later")}</Button>
          <Button variant="primary" size="sm" onClick={canAutoInstall ? onInstall : onOpenRelease} disabled={busy || !availableVersion}>
            {canAutoInstall ? t("update.installAndRestart") : t("update.openDownloads")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function WhatsNewDialog({ open, release, locale, onClose }: { open: boolean; release: ReleaseNote | null; locale: "zh-CN" | "en-US"; onClose: () => void }) {
  const { t } = useI18n();
  if (!release) return null;
  const sectionKeys = {
    added: "releaseNotes.added",
    changed: "releaseNotes.changed",
    fixed: "releaseNotes.fixed",
    known: "releaseNotes.known",
  } as const;
  return (
    <Dialog open={open} onClose={onClose} width="w-[520px] max-w-[calc(100vw-2rem)]">
      <div className="h-[3px] shrink-0 bg-[var(--gradient-thread)]" />
      <div className="px-6 pt-5 pb-4 border-b border-border-subtle">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.16em] text-accent-sky">VERSION {release.version}</div>
            <h3 className="mt-1 font-serif text-[25px] leading-tight text-text-primary">{release.title[locale]}</h3>
            <p className="mt-2 text-[12px] leading-5 text-text-secondary">{release.summary[locale]}</p>
          </div>
          <span className="shrink-0 text-[10px] text-text-tertiary">{release.date}</span>
        </div>
      </div>
      <div className="max-h-[52vh] overflow-y-auto px-6 py-4 flex flex-col gap-4">
        {release.sections.map((section) => (
          <section key={section.type} className="grid grid-cols-[72px_1fr] gap-3">
            <h4 className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-earth">{t(sectionKeys[section.type])}</h4>
            <ul className="flex flex-col gap-2">
              {section.items[locale].map((item) => (
                <li key={item} className="relative pl-3 text-[12px] leading-5 text-text-secondary before:absolute before:left-0 before:top-[8px] before:w-1 before:h-1 before:rounded-full before:bg-accent-sky">{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex justify-end px-6 py-4 border-t border-border-subtle">
        <Button variant="primary" size="sm" onClick={onClose}>{t("update.gotIt")}</Button>
      </div>
    </Dialog>
  );
}

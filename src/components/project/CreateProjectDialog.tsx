import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../types";
import * as tauri from "../../lib/tauri";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { translateError } from "../../i18n/errors";

interface CreateProjectDialogProps {
  open: boolean;
  onCreated: (project: Project) => void;
  onClose: () => void;
}

export default function CreateProjectDialog({ open: isOpen, onCreated, onClose }: CreateProjectDialogProps) {
  const { locale, t } = useI18n();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickDir() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      const dir = typeof selected === "string" ? selected : selected;
      setPath(dir);
      if (!name) {
        const parts = dir.replace(/\\/g, "/").split("/");
        setName(parts[parts.length - 1] ?? "");
      }
    }
  }

  async function handleCreate() {
    if (!path.trim()) {
      setError(t("projectDialog.errorNoPath"));
      return;
    }
    if (!name.trim()) {
      setError(t("projectDialog.errorNoName"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const project = await tauri.createProject(name.trim(), path.trim());
      onCreated(project);
    } catch (e) {
      setError(translateError(e, locale));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <h2 className="text-sm font-normal text-text-primary">{t("projectDialog.title")}</h2>
        <Button variant="icon" onClick={onClose}>×</Button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        <div>
          <label className="block text-xs font-normal text-text-secondary mb-1">
            {t("projectDialog.directory")}
          </label>
          <div className="flex gap-2">
            <Input
              mono
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={t("projectDialog.pathPlaceholder")}
              className="flex-1"
            />
            <Button variant="secondary" size="sm" onClick={handlePickDir}>
              {t("projectDialog.pick")}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-normal text-text-secondary mb-1">
            {t("projectDialog.name")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projectDialog.namePlaceholder")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>

        {error && (
          <div
            className="text-xs text-status-broken px-3 py-2 rounded-md"
            style={{ backgroundColor: "color-mix(in srgb, var(--status-broken) 8%, transparent)" }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-subtle">
        <Button variant="secondary" size="sm" onClick={onClose}>{t("common.back")}</Button>
        <Button variant="primary" size="sm" onClick={handleCreate} disabled={loading}>
          {loading ? t("common.creating") : t("common.create")}
        </Button>
      </div>
    </Dialog>
  );
}

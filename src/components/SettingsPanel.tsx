import { Languages, LogOut, Moon, Shield, Sun } from "lucide-react";
import QRCode from "qrcode";
import { FormEvent, useEffect, useState } from "react";
import type { Language } from "../../shared/types";
import type { AppSettings } from "../../shared/types";
import { api } from "../lib/api";
import type { TFunction } from "../lib/i18n";

type Props = {
  settings: AppSettings;
  t: TFunction;
  onChange: (settings: AppSettings) => void;
  onLogout: () => void;
};

export function SettingsPanel({ settings, t, onChange, onLogout }: Props) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!setup) {
      setQrCode("");
      return;
    }
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220 })
      .then(setQrCode)
      .catch(() => setError(t("totpSetupFailed")));
  }, [setup, t]);

  async function startTotpSetup() {
    setError("");
    setCode("");
    try {
      setSetup(await api.setupTotp());
    } catch {
      setError(t("totpSetupFailed"));
    }
  }

  async function confirmTotp(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const nextSettings = await api.verifyTotp(code);
      onChange(nextSettings);
      setSetup(null);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("totpSetupFailed"));
    }
  }

  async function disableTotp() {
    setError("");
    try {
      onChange(await api.disableTotp());
    } catch {
      setError(t("totpDisableFailed"));
    }
  }

  return (
    <section className="settings-strip">
      <div className="settings-group">
        <button
          className={settings.theme === "dark" ? "icon-toggle active" : "icon-toggle"}
          type="button"
          title={t("darkTerminal")}
          onClick={() => onChange({ ...settings, theme: "dark" })}
        >
          <Moon size={16} />
        </button>
        <button
          className={settings.theme === "light" ? "icon-toggle active" : "icon-toggle"}
          type="button"
          title={t("lightTerminal")}
          onClick={() => onChange({ ...settings, theme: "light" })}
        >
          <Sun size={16} />
        </button>
      </div>
      <label className="language-line">
        <Languages size={16} />
        <span>{t("language")}</span>
        <select value={settings.language} onChange={(event) => onChange({ ...settings, language: event.target.value as Language })}>
          <option value="zh">{t("languageZh")}</option>
          <option value="en">{t("languageEn")}</option>
        </select>
      </label>
      <button className="two-factor-button" type="button" onClick={settings.twoFactorEnabled ? disableTotp : startTotpSetup}>
        <Shield size={16} />
        <span>{settings.twoFactorEnabled ? t("twoFactorEnabled") : t("enableTwoFactor")}</span>
      </button>
      <button className="icon-toggle" type="button" title={t("logout")} onClick={onLogout}>
        <LogOut size={16} />
      </button>
      {setup ? (
        <div className="totp-overlay" role="dialog" aria-modal="true">
          <form className="totp-dialog" onSubmit={confirmTotp}>
            <div className="panel-title">
              <Shield size={18} />
              <span>{t("enableTwoFactor")}</span>
            </div>
            <p>{t("scanQrCode")}</p>
            {qrCode ? <img alt="TOTP QR code" src={qrCode} /> : <div className="qr-placeholder" />}
            <label>
              {t("manualSecret")}
              <input readOnly value={setup.secret} />
            </label>
            <label>
              {t("verificationCode")}
              <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" maxLength={6} autoFocus />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setSetup(null)}>
                {t("cancel")}
              </button>
              <button className="secondary-button" type="submit">
                {t("confirmEnable")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

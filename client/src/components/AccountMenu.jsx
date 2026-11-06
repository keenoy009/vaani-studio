import { useEffect, useRef, useState } from "react";

// The round avatar in the header. Opens a small menu with the signed-in person, Settings and Sign out.
export default function AccountMenu({ user, onSettings, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const initial = ([...user.name.trim()][0] || "V").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`Account menu for ${user.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full border-0 bg-gradient-to-br from-pink to-lav text-[15px] font-extrabold text-[#1B0B17]">{initial}</button>
      {open && (
        <div role="menu" className="absolute top-[54px] right-0 z-30 flex w-[272px] flex-col gap-1 rounded-2xl border border-line bg-panel p-2 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-pink to-lav text-sm font-extrabold text-[#1B0B17]">{initial}</span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold">{user.name}</span>
              <span className="truncate text-xs text-mute">{user.email}</span>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSettings(); }}
            className="h-10 rounded-xl border-0 bg-transparent px-3 text-left text-sm font-semibold text-ink hover:bg-white/5">Settings</button>
          <button type="button" role="menuitem" disabled={busy} onClick={async () => { setBusy(true); await onSignOut(); }}
            className="h-10 rounded-xl border-0 bg-transparent px-3 text-left text-sm font-semibold text-pink hover:bg-pink/10 disabled:opacity-60">{busy ? "Signing out…" : "Sign out"}</button>
        </div>
      )}
    </div>
  );
}

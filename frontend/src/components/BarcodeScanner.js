import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const BarcodeScanner = ({ open, onClose, onDetected }) => {
  const scannerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let scanner = null;
    const boot = (tries = 0) => {
      if (stopped) return;
      if (!document.getElementById("bc-scanner-region")) {
        if (tries < 20) setTimeout(() => boot(tries + 1), 100);
        else setError("scanner region not found");
        return;
      }
      scanner = new Html5Qrcode("bc-scanner-region");
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (text) => {
            if (stopped) return;
            stopped = true;
            scanner.stop().catch(() => {});
            onDetected(text);
          }
        )
        .catch((e) => setError(String(e)));
    };
    boot();
    return () => {
      stopped = true;
      scannerRef.current?.stop().catch(() => {});
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="barcode-scanner-dialog">
        <DialogHeader><DialogTitle className="font-heading">Scan</DialogTitle></DialogHeader>
        <div id="bc-scanner-region" className="w-full rounded-md overflow-hidden bg-black min-h-[240px]" />
        {error && <p data-testid="barcode-scanner-error" className="text-xs text-red-500">Camera unavailable: {error}</p>}
      </DialogContent>
    </Dialog>
  );
};

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, X } from "lucide-react";

export const PrivacyModal = ({
  open,
  onOpenChange,
  onConsent,
  loading,
  title = "Location Sharing Consent",
  body = "",
  agreeLabel = "I Agree & Share Location",
  declineLabel = "Decline",
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-2 border-black" data-testid="privacy-modal">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-6 w-6" />
            <DialogTitle className="font-display text-2xl font-black tracking-tight" data-testid="privacy-title">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">Location sharing consent</DialogDescription>
        </DialogHeader>
        <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line max-h-72 overflow-y-auto" data-testid="privacy-body">
          {body}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-2 border-black"
            data-testid="privacy-decline-btn"
          >
            <X className="h-4 w-4 mr-1" /> {declineLabel}
          </Button>
          <Button
            onClick={onConsent}
            disabled={loading}
            className="bg-primary text-primary-foreground border-2 border-black font-black uppercase tracking-wide"
            data-testid="privacy-consent-btn"
          >
            {loading ? "Getting location…" : agreeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapView } from "@/components/MapView";
import { PrivacyModal } from "@/components/PrivacyModal";
import { MapPin, Loader2, CheckCircle2, HardHat } from "lucide-react";

export default function CheckInPage() {
  const { jobId } = useParams();
  const [settings, setSettings] = useState(null);
  const [job, setJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [values, setValues] = useState({});
  const [locating, setLocating] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checkins, setCheckins] = useState([]);
  const [recenterTo, setRecenterTo] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch((e) => console.error("Failed to load settings", e));
  }, []);

  useEffect(() => {
    setLoadingJob(true);
    const load = async () => {
      try {
        let j;
        if (jobId) {
          j = (await api.get(`/jobs/${jobId}`)).data;
        } else {
          const jobs = (await api.get("/jobs", { params: { active_only: true } })).data;
          j = jobs[0];
        }
        setJob(j || null);
      } catch (e) {
        console.error("Failed to load job", e);
        setJob(null);
      } finally {
        setLoadingJob(false);
      }
    };
    load();
  }, [jobId]);

  const fetchCheckins = useCallback(async () => {
    if (!job?.id) return;
    try {
      const data = (await api.get(`/jobs/${job.id}/checkins`)).data;
      setCheckins(data);
    } catch (e) {
      console.error("Failed to fetch check-ins", e);
    }
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id) return;
    fetchCheckins();
    const t = setInterval(fetchCheckins, 5000);
    return () => clearInterval(t);
  }, [job?.id, fetchCheckins]);

  const validate = () => {
    for (const f of job.custom_fields || []) {
      if (f.required && !((values[f.key] || "").trim())) return `${f.label} is required.`;
    }
    return null;
  };

  const handleShareClick = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (job.consent_enabled !== false) {
      setConsentOpen(true);
    } else {
      captureLocation();
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          await api.post("/checkins", {
            job_id: job.id,
            responses: (job.custom_fields || []).map((f) => ({
              key: f.key,
              label: f.label,
              value: values[f.key] || "",
            })),
            latitude,
            longitude,
          });
          setSubmitted(true);
          setConsentOpen(false);
          setRecenterTo([latitude, longitude]);
          toast.success("Location shared! You are checked in.");
          fetchCheckins();
        } catch (e) {
          toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Submission failed.");
        } finally {
          setLocating(false);
        }
      },
      (geoErr) => {
        setLocating(false);
        toast.error(
          geoErr.code === 1
            ? "Location permission denied. Please enable location access."
            : "Could not get your location. Try again."
        );
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  if (loadingJob) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <HardHat className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="font-display text-3xl font-black">No active job found</h1>
        <p className="text-muted-foreground mt-2">
          There are no active check-in jobs available right now.
        </p>
      </div>
    );
  }

  const area = job.default_map_area || { lat: 20.59, lng: 78.96, zoom: 5 };
  const center = [area.lat, area.lng];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b-2 border-black bg-card sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="logo" className="h-9 w-9 object-cover border border-black/10 rounded" />
            ) : (
              <div className="h-9 w-9 bg-primary flex items-center justify-center rounded border-2 border-black">
                <HardHat className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <div>
              <div className="font-display font-black text-lg leading-none">{settings?.site_title || "TechSpider Site"}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                {settings?.tagline || "Contractor Check-In"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto lg:grid lg:grid-cols-5 lg:gap-8 lg:px-6 lg:py-10">
        {/* Left: content + form */}
        <div className="lg:col-span-2 p-4 sm:p-6 lg:p-0 space-y-6">
          {job.hero_image_url && (
            <div className="relative rounded-lg overflow-hidden border-2 border-black h-40">
              <img src={job.hero_image_url} alt="site" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute bottom-3 left-4 right-4">
                <span className="inline-block bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest px-2 py-1 border border-black">
                  On-Site Check-In
                </span>
              </div>
            </div>
          )}

          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter" data-testid="job-title">
              {job.title}
            </h1>
            <p className="text-base text-muted-foreground mt-3 leading-relaxed whitespace-pre-line" data-testid="job-description">
              {job.description}
            </p>
          </div>

          {submitted ? (
            <div className="bg-card border-2 border-black rounded-lg p-6 text-center" data-testid="checkin-success">
              <CheckCircle2 className="h-12 w-12 text-[hsl(142,71%,45%)] mx-auto mb-3" />
              <h2 className="font-display text-2xl font-black">You're checked in!</h2>
              <p className="text-muted-foreground mt-1">
                Your location was shared successfully. The supervisor has been notified.
              </p>
              <Button
                variant="outline"
                className="mt-4 border-2 border-black"
                onClick={() => setSubmitted(false)}
                data-testid="checkin-again-btn"
              >
                Check in another worker
              </Button>
            </div>
          ) : (
            <div className="bg-card border-2 border-black rounded-lg p-6 space-y-4">
              <h2 className="font-display text-xl font-bold" data-testid="form-heading">
                {job.form_heading || "Your Details"}
              </h2>
              {(job.custom_fields || []).map((f) => (
                <div className="space-y-1.5" key={f.key}>
                  <Label htmlFor={f.key}>
                    {f.label} {f.required && <span className="text-primary">*</span>}
                  </Label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={f.key}
                      data-testid={`input-custom-${f.key}`}
                      value={values[f.key] || ""}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      placeholder={f.label}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  ) : (
                    <Input
                      id={f.key}
                      type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                      data-testid={`input-custom-${f.key}`}
                      value={values[f.key] || ""}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      placeholder={f.label}
                    />
                  )}
                </div>
              ))}

              <Button
                onClick={handleShareClick}
                disabled={locating}
                data-testid="share-location-btn"
                className="w-full h-[64px] text-lg font-black uppercase tracking-wide bg-primary text-primary-foreground border-2 border-black rounded-md hover:-translate-y-1 hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-transform duration-200"
              >
                {locating ? (
                  <Loader2 className="h-6 w-6 mr-2 animate-spin" />
                ) : (
                  <MapPin className="h-6 w-6 mr-2" />
                )}
                {job.button_label || "Share Location"}
              </Button>
            </div>
          )}
        </div>

        {/* Right: map / image / text (controlled from admin) */}
        <div className="lg:col-span-3">
          {job.display_mode === "image" ? (
            <div data-testid="display-image" className="h-[360px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-24 border-t-2 lg:border-2 border-black lg:rounded-lg overflow-hidden bg-muted">
              {job.display_image_url ? (
                <img src={job.display_image_url} alt={job.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  No image set for this job.
                </div>
              )}
            </div>
          ) : job.display_mode === "text" ? (
            <div data-testid="display-text" className="lg:sticky lg:top-24 border-t-2 lg:border-2 border-black lg:rounded-lg bg-card p-6 sm:p-8 lg:min-h-[calc(100vh-8rem)]">
              <div className="prose prose-zinc max-w-none whitespace-pre-line text-base leading-relaxed">
                {job.display_text || "No content set for this job."}
              </div>
            </div>
          ) : (
            <>
              <div className="h-[360px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-24 border-t-2 lg:border-2 border-black lg:rounded-lg overflow-hidden">
                <MapView center={center} zoom={area.zoom} markers={checkins} recenterTo={recenterTo} />
              </div>
              <div className="px-4 lg:px-0 py-2 text-xs uppercase tracking-widest font-bold text-muted-foreground" data-testid="pin-count">
                {checkins.length} check-in{checkins.length === 1 ? "" : "s"} on this job · auto-refresh 5s
              </div>
            </>
          )}
        </div>
      </div>

      <PrivacyModal
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConsent={captureLocation}
        loading={locating}
        title={job.consent_title}
        body={job.consent_body}
        agreeLabel={job.consent_agree_label}
        declineLabel={job.consent_decline_label}
      />
    </div>
  );
}

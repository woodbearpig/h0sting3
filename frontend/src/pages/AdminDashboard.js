import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { MapView } from "@/components/MapView";
import { ImageInput } from "@/components/ImageInput";
import { applyPrimaryColor } from "@/lib/theme";
import {
  HardHat, LogOut, Plus, Trash2, Pencil, Save, MapPin, Copy, Users, Briefcase, Settings2,
} from "lucide-react";

const emptyJob = () => ({
  title: "", description: "", hero_image_url: "", button_label: "Share Location",
  form_heading: "Your Details",
  custom_fields: [
    { uid: crypto.randomUUID(), key: "full_name", label: "Full Name", type: "text", required: true },
    { uid: crypto.randomUUID(), key: "email", label: "Email", type: "email", required: true },
    { uid: crypto.randomUUID(), key: "phone", label: "Phone", type: "tel", required: true },
  ],
  default_map_area: { lat: 40.7128, lng: -74.006, zoom: 12 },
  display_mode: "map", display_image_url: "", display_text: "",
  consent_enabled: true,
  consent_title: "Location Sharing Consent",
  consent_body: "To complete your check-in we need to access your device's GPS location. It is captured once, only when you tap the button, and shared with the site supervisor to verify your on-site attendance.",
  consent_agree_label: "I Agree & Share Location",
  consent_decline_label: "Decline",
  active: true,
});

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate("/admin/login"); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-black bg-secondary text-secondary-foreground sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-primary flex items-center justify-center rounded border-2 border-black">
              <HardHat className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-black text-lg leading-none">Admin Console</div>
              <div className="text-xs uppercase tracking-widest opacity-70 font-bold">{user?.email}</div>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="logout-btn"
            className="border-2 border-white/30 bg-transparent text-white hover:bg-white/10">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Tabs defaultValue="checkins">
          <TabsList className="border-2 border-black bg-card p-1">
            <TabsTrigger value="checkins" data-testid="tab-checkins"><Users className="h-4 w-4 mr-2" />Check-Ins</TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-jobs"><Briefcase className="h-4 w-4 mr-2" />Jobs</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings"><Settings2 className="h-4 w-4 mr-2" />Site Content</TabsTrigger>
          </TabsList>

          <TabsContent value="checkins" className="mt-6"><CheckInsTab /></TabsContent>
          <TabsContent value="jobs" className="mt-6"><JobsTab /></TabsContent>
          <TabsContent value="settings" className="mt-6"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ---------------- Check-Ins ---------------- */
function CheckInsTab() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState("all");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get("/jobs").then((r) => setJobs(r.data)).catch((e) => console.error("Failed to load jobs", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      const params = selected === "all" ? {} : { job_id: selected };
      const data = (await api.get("/checkins", { params })).data;
      setRows(data);
    } catch (e) {
      console.error("Failed to load check-ins", e);
      toast.error("Unable to load check-ins. Please refresh.");
    }
  }, [selected]);

  useEffect(() => {
    fetchRows();
    const t = setInterval(fetchRows, 5000);
    return () => clearInterval(t);
  }, [fetchRows]);

  const jobTitle = (id) => jobs.find((j) => j.id === id)?.title || id;
  const mapCenter = rows.length ? [rows[0].latitude, rows[0].longitude] : [40.7128, -74.006];

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-display text-2xl font-black">All Check-Ins</h2>
          <select
            data-testid="checkins-job-filter"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border-2 border-black rounded-md h-9 px-3 text-sm bg-card font-medium"
          >
            <option value="all">All Jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div className="border-2 border-black rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" data-testid="checkins-table">
              <thead>
                <tr className="bg-secondary text-secondary-foreground text-left uppercase text-xs tracking-wider">
                  <th className="py-2 px-3">Submitted Details</th>
                  <th className="py-2 px-3">Coordinates</th>
                  <th className="py-2 px-3">Job</th>
                  <th className="py-2 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No check-ins yet.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-muted align-top" data-testid="checkin-row">
                    <td className="py-2 px-3">
                      {(r.responses && r.responses.length > 0) ? (
                        <div className="space-y-0.5">
                          {r.responses.map((f, idx) => (
                            <div key={idx}>
                              <span className="text-muted-foreground">{f.label}: </span>
                              <span className="font-medium">{f.value || "—"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div><span className="font-semibold">{r.contractor_name || "—"}</span></div>
                          {r.email && <div className="text-muted-foreground">{r.email}</div>}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</td>
                    <td className="py-2 px-3">{jobTitle(r.job_id)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div>
        <h2 className="font-display text-2xl font-black mb-3">Live Map</h2>
        <div className="h-[420px] border-2 border-black rounded-lg overflow-hidden">
          <MapView center={mapCenter} zoom={11} markers={rows} recenterTo={rows.length ? mapCenter : null} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Jobs ---------------- */
function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => { api.get("/jobs").then((r) => setJobs(r.data)).catch((e) => console.error("Failed to load jobs", e)); }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(emptyJob()); setOpen(true); };
  const openEdit = (j) => {
    setEditing({
      ...emptyJob(), ...j,
      custom_fields: j.custom_fields || [],
      default_map_area: j.default_map_area || emptyJob().default_map_area,
    });
    setOpen(true);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this job and all its check-ins?")) return;
    await api.delete(`/jobs/${id}`);
    toast.success("Job deleted");
    load();
  };

  const copyLink = (id) => {
    const url = `${window.location.origin}/checkin/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Check-in link copied");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-black">Jobs</h2>
        <Button onClick={openNew} data-testid="new-job-btn"
          className="bg-primary text-primary-foreground border-2 border-black font-bold uppercase tracking-wide">
          <Plus className="h-4 w-4 mr-1" /> New Job
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {jobs.map((j) => (
          <div key={j.id} className="bg-card border-2 border-black rounded-lg p-5" data-testid="job-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold leading-tight">{j.title}</h3>
                <span className={`inline-block mt-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 border border-black ${j.active ? "bg-[hsl(142,71%,45%)] text-white" : "bg-muted text-muted-foreground"}`}>
                  {j.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{j.description}</p>
            <div className="text-xs text-muted-foreground mt-2">{(j.custom_fields || []).length} custom field(s)</div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={() => openEdit(j)} data-testid="edit-job-btn"><Pencil className="h-3 w-3 mr-1" />Edit</Button>
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={() => copyLink(j.id)} data-testid="copy-link-btn"><Copy className="h-3 w-3 mr-1" />Link</Button>
              <Button size="sm" variant="outline" className="border-2 border-black text-destructive" onClick={() => remove(j.id)} data-testid="delete-job-btn"><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
            </div>
          </div>
        ))}
      </div>

      <JobDialog open={open} setOpen={setOpen} editing={editing} setEditing={setEditing} onSaved={load} />
    </div>
  );
}

function JobDialog({ open, setOpen, editing, setEditing, onSaved }) {
  const [saving, setSaving] = useState(false);
  if (!editing) return null;

  const setField = (k, v) => setEditing({ ...editing, [k]: v });
  const setArea = (k, v) => setEditing({ ...editing, default_map_area: { ...editing.default_map_area, [k]: v } });

  const addField = () => setEditing({ ...editing, custom_fields: [...editing.custom_fields, { uid: crypto.randomUUID(), key: `field_${editing.custom_fields.length + 1}`, label: "", type: "text", required: false }] });
  const updateField = (i, k, v) => {
    const cf = [...editing.custom_fields];
    cf[i] = { ...cf[i], [k]: v };
    if (k === "label") cf[i].key = v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${i + 1}`;
    setEditing({ ...editing, custom_fields: cf });
  };
  const removeField = (i) => setEditing({ ...editing, custom_fields: editing.custom_fields.filter((_, idx) => idx !== i) });

  const save = async () => {
    if (!editing.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const payload = {
      title: editing.title, description: editing.description, hero_image_url: editing.hero_image_url,
      button_label: editing.button_label, form_heading: editing.form_heading || "Your Details",
      custom_fields: editing.custom_fields,
      default_map_area: {
        lat: parseFloat(editing.default_map_area.lat) || 0,
        lng: parseFloat(editing.default_map_area.lng) || 0,
        zoom: parseInt(editing.default_map_area.zoom) || 12,
      },
      display_mode: editing.display_mode || "map",
      display_image_url: editing.display_image_url || "",
      display_text: editing.display_text || "",
      consent_enabled: editing.consent_enabled !== false,
      consent_title: editing.consent_title || "Location Sharing Consent",
      consent_body: editing.consent_body || "",
      consent_agree_label: editing.consent_agree_label || "I Agree & Share Location",
      consent_decline_label: editing.consent_decline_label || "Decline",
      active: editing.active,
    };
    try {
      if (editing.id) await api.put(`/jobs/${editing.id}`, payload);
      else await api.post("/jobs", payload);
      toast.success("Job saved");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl border-2 border-black max-h-[90vh] overflow-y-auto" data-testid="job-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-black">{editing.id ? "Edit Job" : "New Job"}</DialogTitle>
          <DialogDescription>Configure the job title, content, custom form fields and default map area.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Title</Label>
            <Input data-testid="job-title-input" value={editing.title} onChange={(e) => setField("title", e.target.value)} placeholder="Downtown Tower Site" /></div>
          <div className="space-y-1.5"><Label>Description</Label>
            <Textarea data-testid="job-desc-input" value={editing.description} onChange={(e) => setField("description", e.target.value)} rows={3} /></div>
          <div className="space-y-1.5">
            <Label>Hero Image <span className="text-muted-foreground font-normal">(top-left "On-Site Check-In" block)</span></Label>
            <ImageInput testId="job-image-input" value={editing.hero_image_url} onChange={(v) => setField("hero_image_url", v)} />
          </div>
          <div className="space-y-1.5"><Label>Button Label</Label>
            <Input data-testid="job-button-input" value={editing.button_label} onChange={(e) => setField("button_label", e.target.value)} /></div>

          <div className="border-2 border-black rounded-lg p-4">
            <Label className="uppercase tracking-widest text-xs font-bold">Front Page Right Panel</Label>
            <p className="text-xs text-muted-foreground mt-1">Choose what shows next to the check-in form.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { v: "map", label: "Live Map" },
                { v: "image", label: "Image" },
                { v: "text", label: "Text Block" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  data-testid={`display-mode-${opt.v}`}
                  onClick={() => setField("display_mode", opt.v)}
                  className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black rounded-md transition-colors ${
                    (editing.display_mode || "map") === opt.v
                      ? "bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {(editing.display_mode || "map") === "map" && (
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div><Label className="text-xs">Latitude</Label><Input data-testid="job-lat-input" value={editing.default_map_area.lat} onChange={(e) => setArea("lat", e.target.value)} /></div>
                <div><Label className="text-xs">Longitude</Label><Input data-testid="job-lng-input" value={editing.default_map_area.lng} onChange={(e) => setArea("lng", e.target.value)} /></div>
                <div><Label className="text-xs">Zoom</Label><Input data-testid="job-zoom-input" value={editing.default_map_area.zoom} onChange={(e) => setArea("zoom", e.target.value)} /></div>
              </div>
            )}

            {editing.display_mode === "image" && (
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs">Panel Image</Label>
                <ImageInput testId="job-display-image-input" value={editing.display_image_url} onChange={(v) => setField("display_image_url", v)} />
              </div>
            )}

            {editing.display_mode === "text" && (
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs">Text Content</Label>
                <Textarea data-testid="job-display-text-input" value={editing.display_text} onChange={(e) => setField("display_text", e.target.value)} rows={6} placeholder="Safety briefing, site instructions, contact info…" />
              </div>
            )}
          </div>

          <div className="border-2 border-black rounded-lg p-4">
            <div className="flex items-center justify-between">
              <Label className="uppercase tracking-widest text-xs font-bold">Check-In Form</Label>
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={addField} data-testid="add-field-btn"><Plus className="h-3 w-3 mr-1" />Add Field</Button>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Form Heading</Label>
              <Input data-testid="job-form-heading-input" value={editing.form_heading || ""} onChange={(e) => setField("form_heading", e.target.value)} placeholder="Your Details" />
            </div>
            <div className="space-y-2 mt-4">
              {editing.custom_fields.map((f, i) => (
                <div key={f.uid || f.key || i} className="flex flex-wrap items-center gap-2" data-testid="custom-field-row">
                  <Input className="flex-1 min-w-[140px]" placeholder="Field label (e.g. Full Name)" value={f.label} onChange={(e) => updateField(i, "label", e.target.value)} data-testid={`field-label-${i}`} />
                  <select
                    value={f.type || "text"}
                    onChange={(e) => updateField(i, "type", e.target.value)}
                    data-testid={`field-type-${i}`}
                    className="border-2 border-black rounded-md h-9 px-2 text-sm bg-card"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="tel">Phone</option>
                    <option value="textarea">Long text</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <Switch checked={f.required} onCheckedChange={(v) => updateField(i, "required", v)} data-testid={`field-required-${i}`} /> Req
                  </label>
                  <Button size="icon" variant="ghost" onClick={() => removeField(i)} data-testid={`field-remove-${i}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              {editing.custom_fields.length === 0 && <p className="text-xs text-muted-foreground">No fields yet. Add fields like Full Name, Email, Phone, Site Number…</p>}
            </div>
          </div>

          <div className="border-2 border-black rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-2">
              <Switch checked={editing.consent_enabled !== false} onCheckedChange={(v) => setField("consent_enabled", v)} data-testid="consent-enabled-switch" />
              <span className="uppercase tracking-widest text-xs font-bold">Location Consent Modal</span>
            </label>
            {editing.consent_enabled !== false && (
              <>
                <div className="space-y-1.5"><Label className="text-xs">Modal Title</Label>
                  <Input data-testid="consent-title-input" value={editing.consent_title || ""} onChange={(e) => setField("consent_title", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Modal Body Text</Label>
                  <Textarea data-testid="consent-body-input" rows={4} value={editing.consent_body || ""} onChange={(e) => setField("consent_body", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Agree Button Label</Label>
                    <Input data-testid="consent-agree-input" value={editing.consent_agree_label || ""} onChange={(e) => setField("consent_agree_label", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Decline Button Label</Label>
                    <Input data-testid="consent-decline-input" value={editing.consent_decline_label || ""} onChange={(e) => setField("consent_decline_label", e.target.value)} /></div>
                </div>
                <p className="text-xs text-muted-foreground">When off, clicking the button prompts the browser location dialog directly (no modal).</p>
              </>
            )}
          </div>

          <label className="flex items-center gap-2">
            <Switch checked={editing.active} onCheckedChange={(v) => setField("active", v)} data-testid="job-active-switch" />
            <span className="text-sm font-medium">Active (visible on public check-in)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground border-2 border-black font-bold uppercase" data-testid="save-job-btn">
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Settings ---------------- */
function SettingsTab() {
  const [settings, setSettings] = useState({ site_title: "", logo_url: "", tagline: "", primary_color: "#EA580C", admin_login_heading: "", admin_login_subtitle: "", admin_login_bg_url: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch((e) => console.error("Failed to load settings", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", settings);
      if (settings.primary_color) applyPrimaryColor(settings.primary_color);
      toast.success("Site content saved");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <h2 className="font-display text-2xl font-black mb-4">Site Content</h2>
      <div className="bg-card border-2 border-black rounded-lg p-6 space-y-4">
        <div className="space-y-1.5"><Label>Site Title</Label>
          <Input data-testid="settings-title" value={settings.site_title} onChange={(e) => setSettings({ ...settings, site_title: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Tagline</Label>
          <Input data-testid="settings-tagline" value={settings.tagline} onChange={(e) => setSettings({ ...settings, tagline: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Logo</Label>
          <ImageInput testId="settings-logo" value={settings.logo_url} onChange={(v) => setSettings({ ...settings, logo_url: v })} previewClassName="h-16 w-16" /></div>

        <div className="space-y-1.5">
          <Label>Brand Color <span className="text-muted-foreground font-normal">(applied to buttons &amp; accents everywhere)</span></Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              data-testid="settings-color-picker"
              value={settings.primary_color || "#EA580C"}
              onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
              className="h-10 w-14 rounded border-2 border-black cursor-pointer bg-transparent"
            />
            <Input
              data-testid="settings-color-hex"
              value={settings.primary_color || ""}
              onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
              placeholder="#EA580C"
              className="max-w-[160px] font-mono"
            />
          </div>
        </div>

        <div className="border-2 border-black rounded-lg p-4 space-y-3">
          <Label className="uppercase tracking-widest text-xs font-bold">Admin Login Page</Label>
          <div className="space-y-1.5"><Label className="text-xs">Login Heading</Label>
            <Input data-testid="settings-login-heading" value={settings.admin_login_heading} onChange={(e) => setSettings({ ...settings, admin_login_heading: e.target.value })} placeholder="Admin Console" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Login Subtitle</Label>
            <Input data-testid="settings-login-subtitle" value={settings.admin_login_subtitle} onChange={(e) => setSettings({ ...settings, admin_login_subtitle: e.target.value })} placeholder="Contractor Check-In" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Login Background Image</Label>
            <ImageInput testId="settings-login-bg" value={settings.admin_login_bg_url} onChange={(v) => setSettings({ ...settings, admin_login_bg_url: v })} /></div>
        </div>

        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground border-2 border-black font-bold uppercase" data-testid="save-settings-btn">
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Content"}
        </Button>
      </div>
    </div>
  );
}

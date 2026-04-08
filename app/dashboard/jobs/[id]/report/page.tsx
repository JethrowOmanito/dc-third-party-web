'use client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import type { ChecklistItem, ChecklistResponse, Job } from '@/types';
import { Camera, CheckCircle2, FileDown, Loader2, MinusCircle, Save, Star, Trash2, XCircle } from 'lucide-react';
import { use, useEffect, useRef, useState } from 'react';
import SignaturePad from 'react-signature-canvas';

type CheckStatus = 'done' | 'not_done' | 'na';

export default function ServiceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { user } = useAuthStore();
  const supabase = getSupabaseClient();
  const sigPadRef = useRef<SignaturePad>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistResponses, setChecklistResponses] = useState<Record<number, CheckStatus>>({});
  const [notCleanAreas, setNotCleanAreas] = useState('');
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  useEffect(() => {
    loadAll();
  }, [jobId]);

  const loadAll = async () => {
    const [jobRes, checkRes, reportRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', jobId).single(),
      supabase.from('checklist').select('*').order('sort_order'),
      supabase.from('service_reports').select('*').eq('job_id', jobId).maybeSingle(),
    ]);

    if (jobRes.data) {
      setJob(jobRes.data as Job);
      setCustomerName(jobRes.data.Name || '');
      setCustomerPhone(jobRes.data.Whatsapp_Number || '');
      setCustomerEmail(jobRes.data.Email || '');
      setCustomerAddress(jobRes.data.Title || '');
    }
    if (checkRes.data) setChecklistItems(checkRes.data as ChecklistItem[]);
    if (reportRes.data) {
      const r = reportRes.data;
      setReportId(r.id);
      setNotCleanAreas(r.not_clean_areas || '');
      setRating(r.rating || 0);
      setPhotos(r.photos || []);
      setCustomerName(r.customer_name || customerName);
      setCustomerPhone(r.phone || customerPhone);
      setCustomerEmail(r.email || customerEmail);
      setCustomerAddress(r.address || customerAddress);

      // Load checklist responses
      if (r.id) {
        const { data: responses } = await supabase
          .from('checklist_responses')
          .select('*')
          .eq('report_id', r.id);
        if (responses) {
          const map: Record<number, CheckStatus> = {};
          responses.forEach((resp: ChecklistResponse) => { map[resp.item_id] = resp.status; });
          setChecklistResponses(map);
        }
      }
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(e.target.files)) {
        const ext = file.name.split('.').pop();
        const path = `reports/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data, error } = await supabase.storage.from('service-reports').upload(path, file, { upsert: false });
        if (!error && data) {
          const { data: urlData } = supabase.storage.from('service-reports').getPublicUrl(path);
          newUrls.push(urlData.publicUrl);
        }
      }
      setPhotos((prev) => [...prev, ...newUrls]);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((p) => p !== url));
  };

  const toggleChecklist = (id: number) => {
    setChecklistResponses((prev) => {
      const current = prev[id] || 'not_done';
      const next: CheckStatus = current === 'not_done' ? 'done' : current === 'done' ? 'na' : 'not_done';
      return { ...prev, [id]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get signature if drawn
      let signatureUrl = '';
      if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
        const dataUrl = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
        const blob = await (await fetch(dataUrl)).blob();
        const path = `signatures/${jobId}/${Date.now()}.png`;
        const { data: sigData } = await supabase.storage.from('service-reports').upload(path, blob, { contentType: 'image/png', upsert: true });
        if (sigData) {
          const { data: urlData } = supabase.storage.from('service-reports').getPublicUrl(path);
          signatureUrl = urlData.publicUrl;
        }
      }

      let rId = reportId;
      const reportPayload = {
        job_id: jobId,
        customer_name: customerName,
        phone: customerPhone,
        email: customerEmail,
        address: customerAddress,
        service_date: job?.Start_Date || new Date().toISOString().split('T')[0],
        not_clean_areas: notCleanAreas,
        rating,
        photos,
        signature: !sigPadRef.current?.isEmpty(),
        ...(signatureUrl && { signature_url: signatureUrl }),
        ack_date: new Date().toISOString(),
      };

      if (rId) {
        await supabase.from('service_reports').update(reportPayload).eq('id', rId);
      } else {
        const { data } = await supabase.from('service_reports').insert(reportPayload).select('id').single();
        rId = data?.id || null;
        setReportId(rId);
      }

      // Save checklist responses
      if (rId) {
        const rows = Object.entries(checklistResponses).map(([itemId, status]) => ({
          report_id: rId,
          item_id: Number(itemId),
          status,
        }));
        if (rows.length > 0) {
          await supabase.from('checklist_responses').upsert(rows, { onConflict: 'report_id,item_id' });
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handlePdfExport = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const el = document.getElementById('report-pdf-content');
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/png');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save(`service-report-${job?.Title || jobId}.pdf`);
  };

  // Group checklist by section
  const sections = Array.from(new Set(checklistItems.map((c) => c.section)));

  const statusIcon = (s: CheckStatus | undefined) => {
    if (s === 'done') return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />;
    if (s === 'na') return <MinusCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />;
    return <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-6">
      {/* PDF export wrapper */}
      <div id="report-pdf-content" className="space-y-5">
        {/* Header */}
        <div className="bg-emerald-600 rounded-2xl p-5 text-white">
          <p className="text-emerald-100 text-xs uppercase tracking-wide font-medium">Service Report</p>
          <h2 className="text-xl font-bold mt-1">{job?.Title || 'Loading…'}</h2>
          <p className="text-emerald-200 text-xs mt-1">{job?.Start_Date}</p>
        </div>

        {/* Customer info */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Customer Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Name</label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Phone</label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="mt-1" type="email" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Address</label>
              <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        {sections.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Service Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {sections.map((section) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{section}</p>
                  <div className="space-y-1">
                    {checklistItems
                      .filter((c) => c.section === section)
                      .map((item) => {
                        const status = checklistResponses[item.id];
                        return (
                          <button
                            key={item.id}
                            onClick={() => toggleChecklist(item.id)}
                            className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
                          >
                            {statusIcon(status)}
                            <span className="text-sm text-gray-700">{item.item}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-1">Tap each item to toggle: ✓ Done → ÷ N/A → ✗ Not Done</p>
            </CardContent>
          </Card>
        )}

        {/* Not clean areas */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Areas Not Cleaned / Remarks</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={notCleanAreas}
              onChange={(e) => setNotCleanAreas(e.target.value)}
              placeholder="Describe any areas not cleaned or special remarks…"
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Photos</CardTitle>
              <label className={cn('flex items-center gap-1.5 text-xs font-medium text-emerald-600 cursor-pointer hover:text-emerald-700', uploading && 'opacity-50')}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                Add Photos
                <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
            </div>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No photos yet</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
                    <button
                      onClick={() => removePhoto(url)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rating */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Service Rating</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className="text-2xl transition-transform active:scale-110">
                  <Star className={cn('w-8 h-8', s <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Signature */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Customer Signature</CardTitle>
              <button
                onClick={() => sigPadRef.current?.clear()}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Clear
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50">
              <SignaturePad
                ref={sigPadRef}
                canvasProps={{
                  className: 'w-full',
                  style: { width: '100%', height: '160px', touchAction: 'none' },
                }}
                backgroundColor="rgb(249,250,251)"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">Sign above to acknowledge service completion</p>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={handlePdfExport} className="w-full">
          <FileDown className="w-4 h-4" />
          Export PDF
        </Button>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Report'}
        </Button>
      </div>
    </div>
  );
}

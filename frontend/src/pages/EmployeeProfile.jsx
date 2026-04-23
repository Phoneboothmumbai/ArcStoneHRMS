import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import HelpHint from "../components/HelpHint";
import { CaretDown, CaretUp, FloppyDisk, UploadSimple, Trash, ArrowLeft, CheckCircle } from "@phosphor-icons/react";

const SECTION_LABELS = {
  personal: "Personal",
  contact: "Contact & Address",
  kyc: "KYC (India IDs)",
  statutory_in: "Statutory — PF / ESIC / PT",
  bank: "Bank details",
  employment: "Employment details",
  emergency_contacts: "Emergency contacts",
  family: "Family & nominees",
  education: "Education",
  prior_employment: "Prior employment",
};

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana",
  "Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh",
  "Chandigarh","Puducherry","Andaman and Nicobar","Dadra and Nagar Haveli and Daman and Diu","Lakshadweep",
];

/**
 * Unified profile page.
 * - If emp_id param present → HR view of specific employee
 * - Else → self-service view (/api/profile/me)
 */
export default function EmployeeProfile({ selfView }) {
  const { id: empIdFromUrl } = useParams();
  const [data, setData] = useState(null);
  const [section, setSection] = useState("personal");
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const url = selfView || !empIdFromUrl ? "/profile/me" : `/profile/employee/${empIdFromUrl}`;
      const { data } = await api.get(url);
      setData(data);
      setErr("");
    } catch (e) {
      setErr(formatApiError(e?.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [empIdFromUrl, selfView]);

  if (err) {
    return <AppShell title="Profile"><div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700" data-testid="profile-error">{err}</div></AppShell>;
  }
  if (!data) return <AppShell title="Profile"><div className="text-zinc-500 text-sm">Loading…</div></AppShell>;

  const emp = data.employee;
  const profile = data.profile;
  const editable = data.editable || {};
  const pageTitle = selfView || !empIdFromUrl ? "My profile" : emp.name;

  const patch = async (payload) => {
    try {
      const { data: upd } = await api.patch(`/profile/employee/${emp.id}`, payload);
      setData((d) => ({ ...d, profile: upd }));
      toast.success("Saved");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Save failed");
    }
  };

  return (
    <AppShell title={pageTitle}>
      {!selfView && (
        <div className="mb-4">
          <Link to="/app/employees" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950" data-testid="back-to-employees">
            <ArrowLeft size={14} /> Back to directory
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* Left: overview card + nav */}
        <aside className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-lg p-5" data-testid="profile-overview">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-zinc-950 text-white flex items-center justify-center font-semibold">
                {(emp.name || "").split(" ").map(p => p[0]).slice(0,2).join("")}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{emp.name}</div>
                <div className="text-xs text-zinc-500 truncate">{emp.job_title}</div>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-xs text-zinc-600">
              <div><span className="text-zinc-400">Code</span> · <span className="font-mono-alt">{emp.employee_code}</span></div>
              <div><span className="text-zinc-400">Email</span> · {emp.email}</div>
              <div><span className="text-zinc-400">Type</span> · <Badge variant="outline" className="uppercase text-[10px] ml-1">{emp.employee_type}</Badge></div>
              <div><span className="text-zinc-400">Status</span> · <span className="capitalize">{emp.status}</span></div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-zinc-600 mb-1.5">
                <span>Profile completeness</span>
                <span className="font-medium">{Math.round(profile.profile_completeness || 0)}%</span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{width:`${profile.profile_completeness||0}%`}} data-testid="completeness-bar"/>
              </div>
            </div>
          </div>

          <nav className="bg-white border border-zinc-200 rounded-lg p-2">
            {Object.keys(SECTION_LABELS).map((key) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                data-testid={`profile-tab-${key}`}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  section === key ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {SECTION_LABELS[key]}
                {!editable[key] && <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-400">Read</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Right: active section */}
        <div>
          {section === "personal" && (
            <PersonalSection value={profile.personal} editable={editable.personal} onSave={(v)=>patch({personal:v})}/>
          )}
          {section === "contact" && (
            <ContactSection value={profile.contact} editable={editable.contact} onSave={(v)=>patch({contact:v})}/>
          )}
          {section === "kyc" && (
            <KYCSection value={profile.kyc} editable={editable.kyc} onSave={(v)=>patch({kyc:v})}/>
          )}
          {section === "statutory_in" && (
            <StatutorySection value={profile.statutory_in} editable={editable.statutory_in} onSave={(v)=>patch({statutory_in:v})}/>
          )}
          {section === "bank" && (
            <BankSection value={profile.bank} editable={editable.bank} onSave={(v)=>patch({bank:v})}/>
          )}
          {section === "employment" && (
            <EmploymentSection value={profile.employment} editable={editable.employment} onSave={(v)=>patch({employment:v})}/>
          )}
          {section === "emergency_contacts" && (
            <ListSection
              title="Emergency contacts" testid="section-emergency"
              items={profile.emergency_contacts || []} editable={editable.emergency_contacts}
              template={{name:"",relation:"",phone:"",email:"",is_primary:false}}
              fields={[
                {key:"name",label:"Name"},{key:"relation",label:"Relation"},
                {key:"phone",label:"Phone"},{key:"email",label:"Email",optional:true},
                {key:"is_primary",label:"Primary?",type:"bool"}
              ]}
              onSave={(list)=>patch({emergency_contacts:list})}
            />
          )}
          {section === "family" && (
            <ListSection
              title="Family members & nominees" testid="section-family"
              items={profile.family || []} editable={editable.family}
              template={{name:"",relation:"spouse",dob:"",is_dependent:false,is_nominee:false,nominee_share_pct:null}}
              fields={[
                {key:"name",label:"Name"},
                {key:"relation",label:"Relation",type:"select",options:["spouse","father","mother","son","daughter","brother","sister","other"]},
                {key:"dob",label:"DOB",type:"date",optional:true},
                {key:"is_dependent",label:"Dependent?",type:"bool"},
                {key:"is_nominee",label:"Nominee?",type:"bool"},
                {key:"nominee_share_pct",label:"Share %",type:"number",optional:true},
              ]}
              onSave={(list)=>patch({family:list})}
            />
          )}
          {section === "education" && (
            <ListSection
              title="Education" testid="section-education"
              items={profile.education || []} editable={editable.education}
              template={{degree:"",specialization:"",institution:"",board_or_university:"",year_of_completion:null,grade_or_percentage:""}}
              fields={[
                {key:"degree",label:"Degree"},
                {key:"specialization",label:"Specialization",optional:true},
                {key:"institution",label:"Institution"},
                {key:"board_or_university",label:"Board/University",optional:true},
                {key:"year_of_completion",label:"Year",type:"number",optional:true},
                {key:"grade_or_percentage",label:"Grade",optional:true},
              ]}
              onSave={(list)=>patch({education:list})}
            />
          )}
          {section === "prior_employment" && (
            <ListSection
              title="Prior employment" testid="section-prior"
              items={profile.prior_employment || []} editable={editable.prior_employment}
              template={{company:"",designation:"",from_date:"",to_date:"",reason_for_leaving:"",last_drawn_ctc:null,currency:"INR"}}
              fields={[
                {key:"company",label:"Company"},{key:"designation",label:"Designation"},
                {key:"from_date",label:"From (YYYY-MM)"},{key:"to_date",label:"To (YYYY-MM)",optional:true},
                {key:"reason_for_leaving",label:"Reason for leaving",optional:true,type:"textarea"},
                {key:"last_drawn_ctc",label:"Last CTC (₹)",type:"number",optional:true},
              ]}
              onSave={(list)=>patch({prior_employment:list})}
            />
          )}
          {/* Documents tab is always shown separately below */}
        </div>
      </div>

      <div className="mt-8">
        <DocumentsPanel employeeId={emp.id} />
      </div>
    </AppShell>
  );
}

/* ---------------- Field sections ---------------- */

function FieldRow({ label, hint, children }) {
  return (
    <div>
      <Label className="tiny-label inline-flex items-center gap-1.5">
        {label}
        {hint && <HelpHint text={hint.text} article={hint.article}/>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SaveBar({ editable, dirty, onSave, onReset }) {
  if (!editable) return <div className="text-xs text-zinc-500 italic mt-4">Read-only section. Contact HR to update.</div>;
  if (!dirty) return null;
  return (
    <div className="mt-6 flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onReset} data-testid="cancel-btn">Cancel</Button>
      <Button size="sm" onClick={onSave} data-testid="save-btn" className="gap-1.5"><FloppyDisk size={14} weight="bold" /> Save</Button>
    </div>
  );
}

function useForm(initial) {
  const [form, setForm] = useState(initial || {});
  useEffect(() => { setForm(initial || {}); }, [JSON.stringify(initial)]); // eslint-disable-line
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial || {}), [form, initial]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => setForm(initial || {});
  return { form, set, dirty, reset };
}

function PersonalSection({ value, editable, onSave }) {
  const f = useForm(value);
  return (
    <SectionCard title="Personal" testid="section-personal">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Date of birth"><Input type="date" disabled={!editable} value={f.form.dob||""} onChange={(e)=>f.set("dob",e.target.value)} data-testid="input-dob"/></FieldRow>
        <FieldRow label="Gender">
          <Select value={f.form.gender||""} disabled={!editable} onValueChange={(v)=>f.set("gender",v)}>
            <SelectTrigger data-testid="input-gender"><SelectValue placeholder="Select"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem><SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Blood group">
          <Select value={f.form.blood_group||""} disabled={!editable} onValueChange={(v)=>f.set("blood_group",v)}>
            <SelectTrigger data-testid="input-blood"><SelectValue placeholder="Select"/></SelectTrigger>
            <SelectContent>
              {["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"].map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Marital status">
          <Select value={f.form.marital_status||""} disabled={!editable} onValueChange={(v)=>f.set("marital_status",v)}>
            <SelectTrigger data-testid="input-marital"><SelectValue placeholder="Select"/></SelectTrigger>
            <SelectContent>
              {["single","married","divorced","widowed","separated"].map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Nationality"><Input disabled={!editable} value={f.form.nationality||""} onChange={(e)=>f.set("nationality",e.target.value)} data-testid="input-nationality"/></FieldRow>
        <FieldRow label="Religion (optional)"><Input disabled={!editable} value={f.form.religion||""} onChange={(e)=>f.set("religion",e.target.value)}/></FieldRow>
        <FieldRow label="Category (India)">
          <Select value={f.form.category||""} disabled={!editable} onValueChange={(v)=>f.set("category",v)}>
            <SelectTrigger data-testid="input-category"><SelectValue placeholder="Select"/></SelectTrigger>
            <SelectContent>
              {["General","OBC","SC","ST","EWS"].map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Languages (comma separated)">
          <Input disabled={!editable} value={(f.form.languages||[]).join(", ")} onChange={(e)=>f.set("languages",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))}/>
        </FieldRow>
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" disabled={!editable} checked={!!f.form.physically_challenged} onChange={(e)=>f.set("physically_challenged",e.target.checked)} id="pc"/>
          <Label htmlFor="pc" className="text-sm">Physically challenged (disclose for statutory benefits)</Label>
        </div>
        {f.form.physically_challenged && (
          <div className="col-span-2">
            <FieldRow label="Disability details"><Textarea disabled={!editable} value={f.form.disability_details||""} onChange={(e)=>f.set("disability_details",e.target.value)}/></FieldRow>
          </div>
        )}
      </div>
      <SaveBar editable={editable} dirty={f.dirty} onSave={()=>onSave(f.form)} onReset={f.reset}/>
    </SectionCard>
  );
}

function AddressFields({ prefix, value, editable, onChange }) {
  const v = value || {};
  const up = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-2 gap-4">
      <FieldRow label="Line 1"><Input disabled={!editable} value={v.line1||""} onChange={(e)=>up("line1",e.target.value)} data-testid={`${prefix}-line1`}/></FieldRow>
      <FieldRow label="Line 2"><Input disabled={!editable} value={v.line2||""} onChange={(e)=>up("line2",e.target.value)}/></FieldRow>
      <FieldRow label="City"><Input disabled={!editable} value={v.city||""} onChange={(e)=>up("city",e.target.value)}/></FieldRow>
      <FieldRow label="State">
        <Select value={v.state||""} disabled={!editable} onValueChange={(val)=>up("state",val)}>
          <SelectTrigger><SelectValue placeholder="Select state"/></SelectTrigger>
          <SelectContent>{INDIAN_STATES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Country"><Input disabled={!editable} value={v.country||"India"} onChange={(e)=>up("country",e.target.value)}/></FieldRow>
      <FieldRow label="Pincode"><Input disabled={!editable} value={v.pincode||""} onChange={(e)=>up("pincode",e.target.value)} data-testid={`${prefix}-pincode`}/></FieldRow>
    </div>
  );
}

function ContactSection({ value, editable, onSave }) {
  const f = useForm(value);
  return (
    <SectionCard title="Contact & Address" testid="section-contact">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Personal email"><Input type="email" disabled={!editable} value={f.form.personal_email||""} onChange={(e)=>f.set("personal_email",e.target.value)} data-testid="input-personal-email"/></FieldRow>
        <FieldRow label="Alternate phone"><Input disabled={!editable} value={f.form.alt_phone||""} onChange={(e)=>f.set("alt_phone",e.target.value)}/></FieldRow>
      </div>
      <h4 className="font-display font-semibold text-sm mt-6 mb-3">Current address</h4>
      <AddressFields prefix="curr" value={f.form.current_address} editable={editable} onChange={(v)=>f.set("current_address",v)}/>
      <div className="flex items-center gap-2 mt-4">
        <input type="checkbox" disabled={!editable} checked={!!f.form.same_as_current} onChange={(e)=>{
          const checked = e.target.checked;
          f.set("same_as_current", checked);
          if (checked) f.set("permanent_address", f.form.current_address);
        }} id="same-addr"/>
        <Label htmlFor="same-addr" className="text-sm">Permanent address same as current</Label>
      </div>
      {!f.form.same_as_current && (
        <>
          <h4 className="font-display font-semibold text-sm mt-6 mb-3">Permanent address</h4>
          <AddressFields prefix="perm" value={f.form.permanent_address} editable={editable} onChange={(v)=>f.set("permanent_address",v)}/>
        </>
      )}
      <SaveBar editable={editable} dirty={f.dirty} onSave={()=>onSave(f.form)} onReset={f.reset}/>
    </SectionCard>
  );
}

function KYCSection({ value, editable, onSave }) {
  const f = useForm(value);
  return (
    <SectionCard title="KYC — India IDs" subtitle="Aadhaar is stored only as last 4 digits for privacy" testid="section-kyc">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="PAN (10 char)" hint={{text:"10-character alphanumeric Permanent Account Number. Required for TDS and salary processing.", article:"kyc-documents-employee"}}><Input disabled={!editable} value={f.form.pan||""} onChange={(e)=>f.set("pan",e.target.value.toUpperCase())} data-testid="input-pan" maxLength={10}/></FieldRow>
        <FieldRow label="Aadhaar — last 4 digits" hint={{text:"We only store the last 4 digits of Aadhaar for DPDP compliance. The full 12-digit number is never retained.", article:"kyc-documents-employee"}}><Input disabled={!editable} value={f.form.aadhaar_last4||""} onChange={(e)=>f.set("aadhaar_last4",e.target.value.replace(/\D/g,"").slice(0,4))} data-testid="input-aadhaar" maxLength={4}/></FieldRow>
        <FieldRow label="Passport number"><Input disabled={!editable} value={f.form.passport_number||""} onChange={(e)=>f.set("passport_number",e.target.value)}/></FieldRow>
        <FieldRow label="Passport expiry"><Input type="date" disabled={!editable} value={f.form.passport_expiry||""} onChange={(e)=>f.set("passport_expiry",e.target.value)}/></FieldRow>
        <FieldRow label="Driving licence"><Input disabled={!editable} value={f.form.driving_license||""} onChange={(e)=>f.set("driving_license",e.target.value)}/></FieldRow>
        <FieldRow label="Voter ID"><Input disabled={!editable} value={f.form.voter_id||""} onChange={(e)=>f.set("voter_id",e.target.value)}/></FieldRow>
      </div>
      <SaveBar editable={editable} dirty={f.dirty} onSave={()=>onSave(f.form)} onReset={f.reset}/>
    </SectionCard>
  );
}

function StatutorySection({ value, editable, onSave }) {
  const f = useForm(value);
  return (
    <SectionCard title="Statutory — India (PF · ESIC · PT · LWF · NPS)" testid="section-statutory">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="UAN (Universal Account Number)" hint={{text:"12-digit UAN issued by EPFO. If the employee worked before, reuse their existing UAN — never generate a new one.", article:"india-statutory-pf-esic-pt"}}><Input disabled={!editable} value={f.form.uan||""} onChange={(e)=>f.set("uan",e.target.value)} data-testid="input-uan"/></FieldRow>
        <FieldRow label="PF number" hint={{text:"Establishment-wise PF account number for this employee. Format: region code + office code + establishment + account number.", article:"india-statutory-pf-esic-pt"}}><Input disabled={!editable} value={f.form.pf_number||""} onChange={(e)=>f.set("pf_number",e.target.value)} data-testid="input-pfnum"/></FieldRow>
        <FieldRow label="ESIC number" hint={{text:"Applies only to employees earning ≤ ₹21,000/month. Leave blank if not applicable.", article:"india-statutory-pf-esic-pt"}}><Input disabled={!editable} value={f.form.esic_number||""} onChange={(e)=>f.set("esic_number",e.target.value)}/></FieldRow>
        <FieldRow label="Professional Tax state" hint={{text:"PT is a state-level tax. Applicable in Maharashtra, Karnataka, Tamil Nadu, West Bengal, and ~10 others. NOT applicable in Delhi, UP, Haryana, Punjab, Rajasthan.", article:"india-statutory-pf-esic-pt"}}>
          <Select value={f.form.pt_state||""} disabled={!editable} onValueChange={(v)=>f.set("pt_state",v)}>
            <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
            <SelectContent>{INDIAN_STATES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </FieldRow>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        {[
          ["pf_opted_in","PF opted in"],["esic_opted_in","ESIC opted in"],
          ["nps_opted_in","NPS opted in"],["lwf_applicable","LWF applicable"],
        ].map(([k,lbl])=>(
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!editable} checked={!!f.form[k]} onChange={(e)=>f.set(k,e.target.checked)}/>
            <span>{lbl}</span>
          </label>
        ))}
      </div>
      <SaveBar editable={editable} dirty={f.dirty} onSave={()=>onSave(f.form)} onReset={f.reset}/>
    </SectionCard>
  );
}

function BankSection({ value, editable, onSave }) {
  const f = useForm(value);
  return (
    <SectionCard title="Bank details" testid="section-bank">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Account holder name"><Input disabled={!editable} value={f.form.account_holder_name||""} onChange={(e)=>f.set("account_holder_name",e.target.value)}/></FieldRow>
        <FieldRow label="Account number"><Input disabled={!editable} value={f.form.account_number||""} onChange={(e)=>f.set("account_number",e.target.value)} data-testid="input-acct-num"/></FieldRow>
        <FieldRow label="IFSC" hint={{text:"11-character IFSC code of the bank branch (e.g. HDFC0001234). Find it on a cancelled cheque or the bank's website."}}><Input disabled={!editable} value={f.form.ifsc||""} onChange={(e)=>f.set("ifsc",e.target.value.toUpperCase())} data-testid="input-ifsc"/></FieldRow>
        <FieldRow label="Bank name"><Input disabled={!editable} value={f.form.bank_name||""} onChange={(e)=>f.set("bank_name",e.target.value)}/></FieldRow>
        <FieldRow label="Branch"><Input disabled={!editable} value={f.form.branch||""} onChange={(e)=>f.set("branch",e.target.value)}/></FieldRow>
        <FieldRow label="Account type">
          <Select value={f.form.account_type||"salary"} disabled={!editable} onValueChange={(v)=>f.set("account_type",v)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="savings">Savings</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="salary">Salary</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      </div>
      <SaveBar editable={editable} dirty={f.dirty} onSave={()=>onSave(f.form)} onReset={f.reset}/>
    </SectionCard>
  );
}

function EmploymentSection({ value, editable, onSave }) {
  const f = useForm(value);
  return (
    <SectionCard title="Employment details" testid="section-employment">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Designation"><Input disabled={!editable} value={f.form.designation||""} onChange={(e)=>f.set("designation",e.target.value)}/></FieldRow>
        <FieldRow label="Grade"><Input disabled={!editable} value={f.form.grade||""} onChange={(e)=>f.set("grade",e.target.value)}/></FieldRow>
        <FieldRow label="Band"><Input disabled={!editable} value={f.form.band||""} onChange={(e)=>f.set("band",e.target.value)}/></FieldRow>
        <FieldRow label="Employment type">
          <Select value={f.form.employment_type||"permanent"} disabled={!editable} onValueChange={(v)=>f.set("employment_type",v)}>
            <SelectTrigger data-testid="input-emptype"><SelectValue/></SelectTrigger>
            <SelectContent>
              {["permanent","contract","intern","consultant","probation","part_time"].map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Date of joining"><Input type="date" disabled={!editable} value={f.form.date_of_joining||""} onChange={(e)=>f.set("date_of_joining",e.target.value)} data-testid="input-doj"/></FieldRow>
        <FieldRow label="Confirmation date"><Input type="date" disabled={!editable} value={f.form.confirmation_date||""} onChange={(e)=>f.set("confirmation_date",e.target.value)}/></FieldRow>
        <FieldRow label="Probation end"><Input type="date" disabled={!editable} value={f.form.probation_end||""} onChange={(e)=>f.set("probation_end",e.target.value)}/></FieldRow>
        <FieldRow label="Probation months"><Input type="number" disabled={!editable} value={f.form.probation_months??6} onChange={(e)=>f.set("probation_months",Number(e.target.value))}/></FieldRow>
        <FieldRow label="Work location"><Input disabled={!editable} value={f.form.work_location||""} onChange={(e)=>f.set("work_location",e.target.value)}/></FieldRow>
        <FieldRow label="Cost center"><Input disabled={!editable} value={f.form.cost_center||""} onChange={(e)=>f.set("cost_center",e.target.value)}/></FieldRow>
        <FieldRow label="Business unit"><Input disabled={!editable} value={f.form.business_unit||""} onChange={(e)=>f.set("business_unit",e.target.value)}/></FieldRow>
        <FieldRow label="Shift"><Input disabled={!editable} value={f.form.shift||""} onChange={(e)=>f.set("shift",e.target.value)}/></FieldRow>
        <FieldRow label="Notice period (days)"><Input type="number" disabled={!editable} value={f.form.notice_period_days??60} onChange={(e)=>f.set("notice_period_days",Number(e.target.value))}/></FieldRow>
      </div>
      <SaveBar editable={editable} dirty={f.dirty} onSave={()=>onSave(f.form)} onReset={f.reset}/>
    </SectionCard>
  );
}

function ListSection({ title, items, fields, template, editable, onSave, testid }) {
  const [rows, setRows] = useState(items || []);
  useEffect(() => { setRows(items || []); }, [JSON.stringify(items)]); // eslint-disable-line
  const dirty = JSON.stringify(rows) !== JSON.stringify(items || []);
  return (
    <SectionCard title={title} testid={testid}
      action={editable && <Button size="sm" variant="outline" onClick={()=>setRows(r=>[...r,{...template}])} data-testid={`${testid}-add`}>+ Add</Button>}
    >
      {rows.length === 0 && <div className="text-sm text-zinc-500">No entries yet.</div>}
      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={i} className="bg-zinc-50 border border-zinc-200 rounded-md p-4" data-testid={`${testid}-row-${i}`}>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(fd => (
                <FieldRow key={fd.key} label={fd.label + (fd.optional ? " (opt)" : "")}>
                  {fd.type === "bool" ? (
                    <input type="checkbox" disabled={!editable} checked={!!row[fd.key]} onChange={(e)=>setRows(rs=>rs.map((r2,j)=>j===i?{...r2,[fd.key]:e.target.checked}:r2))}/>
                  ) : fd.type === "select" ? (
                    <Select disabled={!editable} value={row[fd.key]||""} onValueChange={(v)=>setRows(rs=>rs.map((r2,j)=>j===i?{...r2,[fd.key]:v}:r2))}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{fd.options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : fd.type === "textarea" ? (
                    <Textarea disabled={!editable} value={row[fd.key]||""} onChange={(e)=>setRows(rs=>rs.map((r2,j)=>j===i?{...r2,[fd.key]:e.target.value}:r2))}/>
                  ) : (
                    <Input type={fd.type||"text"} disabled={!editable} value={row[fd.key]??""} onChange={(e)=>{
                      const v = fd.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value;
                      setRows(rs=>rs.map((r2,j)=>j===i?{...r2,[fd.key]:v}:r2));
                    }}/>
                  )}
                </FieldRow>
              ))}
            </div>
            {editable && (
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="ghost" onClick={()=>setRows(rs=>rs.filter((_,j)=>j!==i))} data-testid={`${testid}-remove-${i}`} className="text-red-600 gap-1"><Trash size={14}/>Remove</Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {editable && dirty && (
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={()=>setRows(items||[])}>Cancel</Button>
          <Button size="sm" onClick={()=>onSave(rows)} data-testid={`${testid}-save`} className="gap-1.5"><FloppyDisk size={14}/> Save</Button>
        </div>
      )}
      {!editable && <div className="text-xs text-zinc-500 italic mt-4">Read-only. Contact HR to update.</div>}
    </SectionCard>
  );
}

/* ---------------- Documents Panel ---------------- */

const DOC_CATEGORIES = [
  "identity","education","prior_employment","offer_letter","appointment_letter",
  "experience_letter","relieving_letter","medical","insurance","pf","tax","other"
];

function DocumentsPanel({ employeeId }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("identity");

  const load = async () => {
    const { data } = await api.get(`/documents/employee/${employeeId}`);
    setDocs(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employeeId]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large (max 2 MB)");
      return;
    }
    setUploading(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      await api.post(`/documents/employee/${employeeId}`, {
        category, filename: file.name, content_type: file.type || "application/octet-stream", data_base64: b64,
      });
      toast.success("Document uploaded");
      await load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const download = async (id, filename) => {
    try {
      const { data } = await api.get(`/documents/${id}/download`);
      const link = document.createElement("a");
      link.href = `data:${data.content_type};base64,${data.data_base64}`;
      link.download = filename;
      link.click();
    } catch (err) {
      toast.error("Download failed");
    }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    toast.success("Deleted");
    await load();
  };

  return (
    <SectionCard title="Document vault" subtitle="Max 2 MB per file · Base64 stored (will migrate to S3 in Phase 1G)" testid="section-documents"
      action={
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48 h-9" data-testid="doc-category-select"><SelectValue/></SelectTrigger>
            <SelectContent>{DOC_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
          </Select>
          <label className="inline-flex items-center gap-1.5 bg-zinc-950 text-white px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-zinc-800" data-testid="doc-upload-btn">
            <UploadSimple size={14}/> {uploading ? "Uploading…" : "Upload"}
            <input type="file" className="hidden" onChange={handleFile} disabled={uploading}/>
          </label>
        </div>
      }
    >
      {docs.length === 0 && <div className="text-sm text-zinc-500">No documents uploaded.</div>}
      <div className="divide-y divide-zinc-100">
        {docs.map(d=>(
          <div key={d.id} className="flex items-center gap-4 py-3" data-testid={`doc-row-${d.id}`}>
            <div className="flex-1">
              <div className="text-sm font-medium">{d.filename}</div>
              <div className="text-xs text-zinc-500">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider mr-2">{d.category.replace(/_/g," ")}</Badge>
                {(d.size_bytes/1024).toFixed(1)} KB · {new Date(d.created_at).toLocaleDateString()} · by {d.uploaded_by_name}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={()=>download(d.id,d.filename)} data-testid={`doc-download-${d.id}`}>Download</Button>
            <Button size="sm" variant="ghost" onClick={()=>del(d.id)} className="text-red-600" data-testid={`doc-delete-${d.id}`}><Trash size={14}/></Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

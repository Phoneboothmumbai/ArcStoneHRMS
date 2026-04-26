import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, PencilSimple, Buildings, MapPin, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

const IN_STATES = [
  ["IN-AP","Andhra Pradesh"], ["IN-AR","Arunachal Pradesh"], ["IN-AS","Assam"],
  ["IN-BR","Bihar"], ["IN-CT","Chhattisgarh"], ["IN-GA","Goa"], ["IN-GJ","Gujarat"],
  ["IN-HR","Haryana"], ["IN-HP","Himachal Pradesh"], ["IN-JK","Jammu & Kashmir"],
  ["IN-JH","Jharkhand"], ["IN-KA","Karnataka"], ["IN-KL","Kerala"], ["IN-MP","Madhya Pradesh"],
  ["IN-MH","Maharashtra"], ["IN-MN","Manipur"], ["IN-ML","Meghalaya"], ["IN-MZ","Mizoram"],
  ["IN-NL","Nagaland"], ["IN-OR","Odisha"], ["IN-PB","Punjab"], ["IN-RJ","Rajasthan"],
  ["IN-SK","Sikkim"], ["IN-TN","Tamil Nadu"], ["IN-TG","Telangana"], ["IN-TR","Tripura"],
  ["IN-UP","Uttar Pradesh"], ["IN-UT","Uttarakhand"], ["IN-WB","West Bengal"],
  ["IN-DL","Delhi"], ["IN-CH","Chandigarh"], ["IN-PY","Puducherry"],
];

export default function Branches() {
  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState(blank());

  function blank() {
    return { country_id: "", name: "", city: "", state_code: "", address: "",
             pincode: "", phone: "", is_head_office: false };
  }

  const load = async () => {
    try {
      const [b, c] = await Promise.all([api.get("/org/branches"), api.get("/org/countries")]);
      setRows(b.data); setCountries(c.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!f.name) { toast.error("Branch name required"); return; }
    try {
      if (editing) {
        const stateName = IN_STATES.find(s => s[0] === f.state_code)?.[1];
        await api.put(`/org/branches/${editing.id}`, { ...f, state_name: stateName });
        toast.success("Branch updated");
      } else {
        if (!f.country_id) { toast.error("Country required"); return; }
        await api.post("/org/branches", { name: f.name, parent_id: f.country_id, city: f.city, address: f.address });
        const stateName = IN_STATES.find(s => s[0] === f.state_code)?.[1];
        // PUT to set state/HQ since POST doesn't accept these yet
        const just = (await api.get("/org/branches")).data.find(x => x.name === f.name && x.country_id === f.country_id);
        if (just) {
          await api.put(`/org/branches/${just.id}`, {
            state_code: f.state_code, state_name: stateName, pincode: f.pincode,
            phone: f.phone, is_head_office: f.is_head_office,
          });
        }
        toast.success("Branch created");
      }
      setOpen(false); setEditing(null); setF(blank()); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this branch? Will fail if employees are assigned.")) return;
    try {
      await api.delete(`/org/branches/${id}`);
      toast.success("Removed"); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const startEdit = (b) => {
    setEditing(b);
    setF({
      country_id: b.country_id, name: b.name, city: b.city || "",
      state_code: b.state_code || "", address: b.address || "",
      pincode: b.pincode || "", phone: b.phone || "",
      is_head_office: !!b.is_head_office,
    });
    setOpen(true);
  };

  return (
    <AppShell title="Locations">
      <SectionCard title={`${rows.length} office locations`}
        subtitle="Each office's state drives statutory deductions (LWF, PT) for its employees."
        testid="section-branches"
        action={
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setF(blank()); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" data-testid="branch-new"><Plus size={14} weight="bold"/> Add location</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? `Edit · ${editing.name}` : "New office location"}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Office name *</Label>
                    <Input className="mt-1" value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="branch-name"/>
                  </div>
                  <div><Label>City *</Label>
                    <Input className="mt-1" value={f.city} onChange={e=>setF({...f,city:e.target.value})} data-testid="branch-city"/>
                  </div>
                </div>
                {!editing && (
                  <div><Label>Country *</Label>
                    <Select value={f.country_id} onValueChange={v=>setF({...f,country_id:v})}>
                      <SelectTrigger className="mt-1" data-testid="branch-country"><SelectValue placeholder="Select country"/></SelectTrigger>
                      <SelectContent>{countries.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>State</Label>
                    <Select value={f.state_code || "_none"} onValueChange={v=>setF({...f,state_code:v==="_none"?"":v})}>
                      <SelectTrigger className="mt-1" data-testid="branch-state"><SelectValue placeholder="—"/></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value="_none">—</SelectItem>
                        {IN_STATES.map(([code,name])=>(<SelectItem key={code} value={code}>{name} ({code})</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-zinc-500 mt-1">Drives LWF / PT in payroll.</p>
                  </div>
                  <div><Label>Pincode</Label>
                    <Input className="mt-1" value={f.pincode} onChange={e=>setF({...f,pincode:e.target.value})}/>
                  </div>
                </div>
                <div><Label>Address</Label>
                  <Input className="mt-1" value={f.address} onChange={e=>setF({...f,address:e.target.value})}/>
                </div>
                <div><Label>Phone</Label>
                  <Input className="mt-1" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.is_head_office} onChange={e=>setF({...f,is_head_office:e.target.checked})} data-testid="branch-hq"/>
                  Mark as head office (HQ) — only one allowed per company
                </label>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={()=>{setOpen(false); setEditing(null); setF(blank());}}>Cancel</Button>
                <Button onClick={submit} data-testid="branch-save">{editing?"Save":"Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }>
        {rows.length === 0 && <div className="rounded border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">No locations yet.</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(b=>(
            <article key={b.id} className="border border-zinc-200 rounded-lg p-4 hover:shadow-sm transition-shadow" data-testid={`branch-card-${b.id}`}>
              <div className="flex items-start gap-3">
                <div className={`flex-none w-10 h-10 rounded-lg flex items-center justify-center ${b.is_head_office ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}>
                  <Buildings size={18} weight="bold"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{b.name}</h3>
                    {b.is_head_office && <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200 text-amber-700">HQ</Badge>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500"><MapPin size={11}/> {b.city}{b.state_name?`, ${b.state_name}`:""}{b.pincode?` · ${b.pincode}`:""}</div>
                  {b.state_code && <Badge variant="outline" className="text-[10px] mt-2 font-mono-alt">{b.state_code}</Badge>}
                  {b.phone && <div className="text-xs text-zinc-500 mt-1">📞 {b.phone}</div>}
                  {b.address && <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{b.address}</div>}
                </div>
              </div>
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-zinc-100">
                <Button size="sm" variant="outline" onClick={()=>startEdit(b)}><PencilSimple size={13}/></Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={()=>del(b.id)}><Trash size={13}/></Button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}

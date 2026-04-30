import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { MagnifyingGlass, ArrowLeft, Eye, Plus, PencilSimple, Trash, FileText } from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";

/** Main KB shell — list view. */
export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(null);
  const { user } = useAuth();

  const load = async () => {
    const params = {};
    if (q) params.q = q;
    if (cat) params.category = cat;
    const [arts, cats] = await Promise.all([
      api.get("/kb/articles", { params }),
      api.get("/kb/categories"),
    ]);
    setArticles(arts.data);
    setCategories(cats.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, cat]);

  return (
    <AppShell title="Help & Knowledge Base">
      <div className="grid grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-lg p-2">
            <button
              onClick={() => setCat(null)}
              data-testid="kb-cat-all"
              className={`w-full text-left px-3 py-2 rounded-md text-sm ${!cat ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50"}`}
            >
              All topics ({categories.reduce((a,c)=>a+c.count,0)})
            </button>
            {categories.map(c => (
              <button
                key={c.name}
                onClick={() => setCat(c.name)}
                data-testid={`kb-cat-${c.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`}
                className={`w-full text-left px-3 py-2 rounded-md text-sm ${cat === c.name ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50"} ${c.count === 0 ? "opacity-50" : ""}`}
                disabled={c.count === 0}
              >
                {c.name} <span className="text-xs text-zinc-400 ml-1">({c.count})</span>
              </button>
            ))}
          </div>
          {user?.role === "super_admin" && (
            <Link to="/app/kb-admin" className="block" data-testid="kb-admin-link">
              <Button size="sm" variant="outline" className="w-full gap-1.5"><PencilSimple size={14}/> Manage articles</Button>
            </Link>
          )}
        </aside>

        <div>
          <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <MagnifyingGlass size={18} className="text-zinc-400 ml-2"/>
            <Input
              value={q} onChange={(e)=>setQ(e.target.value)}
              placeholder="Search articles — e.g. UAN, onboarding, approval workflows…"
              className="border-0 focus-visible:ring-0 shadow-none"
              data-testid="kb-search"
            />
          </div>

          {articles.length === 0 && (
            <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center text-sm text-zinc-500" data-testid="kb-empty">
              No articles match. Try a different search or pick another category.
            </div>
          )}

          <div className="space-y-3">
            {articles.map(a => (
              <Link
                key={a.id} to={`/app/help/${a.slug}`}
                className="block bg-white border border-zinc-200 rounded-lg p-5 hover:border-zinc-950 hover:shadow-sm transition-all group"
                data-testid={`kb-article-${a.slug}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{a.category}</Badge>
                      {a.view_count > 0 && (
                        <span className="text-xs text-zinc-400 inline-flex items-center gap-1"><Eye size={12}/> {a.view_count}</span>
                      )}
                    </div>
                    <div className="font-display font-semibold text-lg group-hover:underline">{a.title}</div>
                    {a.excerpt && <div className="text-sm text-zinc-600 mt-1">{a.excerpt}</div>}
                  </div>
                  <FileText size={20} className="text-zinc-300 group-hover:text-zinc-950 flex-shrink-0"/>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/** Single-article view. */
export function KnowledgeBaseArticle() {
  const { slug } = useParams();
  const [art, setArt] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/kb/articles/${slug}`);
        setArt(data);
      } catch (e) {
        setErr(formatApiError(e?.response?.data?.detail) || "Not found");
      }
    })();
  }, [slug]);

  if (err) return <AppShell title="Article not found"><div className="text-sm text-red-600">{err}</div></AppShell>;
  if (!art) return <AppShell title="Loading…"><div className="text-sm text-zinc-500">Loading…</div></AppShell>;

  return (
    <AppShell title={art.title}>
      <div className="mb-4">
        <Link to="/app/help" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950" data-testid="kb-back-link">
          <ArrowLeft size={14}/> Back to help
        </Link>
      </div>
      <article className="bg-white border border-zinc-200 rounded-lg p-10 max-w-3xl" data-testid="kb-article-content">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{art.category}</Badge>
        <h1 className="font-display font-bold text-3xl mt-3 mb-2 tracking-tight">{art.title}</h1>
        <div className="text-xs text-zinc-500 mb-6">
          By {art.author_name} · updated {new Date(art.updated_at).toLocaleDateString()} · {art.view_count} views
        </div>
        <div className="prose prose-zinc max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-zinc-950 prose-a:underline prose-code:bg-zinc-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-[''] prose-table:text-sm prose-th:bg-zinc-50">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{art.content}</ReactMarkdown>
        </div>
      </article>
    </AppShell>
  );
}

/** Super Admin KB editor — list + create/edit dialog. */
export function KBAdmin() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [audienceRoles, setAudienceRoles] = useState([]);

  const load = async () => {
    const { data } = await api.get("/kb/admin/articles");
    setRows(data);
  };
  useEffect(() => {
    load();
    api.get("/kb/admin/roles").then(r => setAudienceRoles(r.data)).catch(() => {});
  }, []);

  const del = async (id) => {
    if (!window.confirm("Delete this article?")) return;
    await api.delete(`/kb/admin/articles/${id}`);
    toast.success("Deleted");
    load();
  };

  const openNew = () => {
    setEditing({
      title: "", category: "Getting Started", excerpt: "", content: "",
      tags: "", related_page: "", is_published: true,
      visible_roles: [],   // empty = visible to all
    });
    setOpen(true);
  };
  const openEdit = (a) => {
    setEditing({ ...a, tags: (a.tags || []).join(", "), visible_roles: a.visible_roles || [] });
    setOpen(true);
  };

  const toggleRole = (roleValue) => {
    setEditing(f => {
      const cur = f.visible_roles || [];
      return {
        ...f,
        visible_roles: cur.includes(roleValue)
          ? cur.filter(r => r !== roleValue)
          : [...cur, roleValue],
      };
    });
  };

  const save = async () => {
    const payload = {
      title: editing.title, category: editing.category, excerpt: editing.excerpt,
      content: editing.content, related_page: editing.related_page || null,
      is_published: !!editing.is_published,
      tags: (editing.tags || "").split(",").map(s => s.trim()).filter(Boolean),
      visible_roles: editing.visible_roles || [],
    };
    try {
      if (editing.id) {
        await api.put(`/kb/admin/articles/${editing.id}`, payload);
      } else {
        await api.post("/kb/admin/articles", payload);
      }
      toast.success("Saved");
      setOpen(false); setEditing(null); load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Save failed");
    }
  };

  const CATEGORIES = [
    "Getting Started", "Employees & Profile", "Onboarding", "Offboarding & Exit",
    "Leave & Attendance", "Approvals & Workflows", "Admin & Modules",
    "India Statutory (PF, ESIC, PT)", "Troubleshooting",
  ];

  // Render the role badges shown next to each row in the admin list.
  const audienceLabel = (vr) => {
    if (!vr || vr.length === 0) return "All roles";
    if (vr.length === 1) return vr[0].replace(/_/g, " ");
    return `${vr.length} roles`;
  };

  return (
    <AppShell title="Knowledge Base · Admin">
      <SectionCard
        title={`${rows.length} articles`}
        subtitle="Each article can be restricted to specific roles. Empty = everyone."
        testid="section-kb-admin"
        action={<Button size="sm" onClick={openNew} className="gap-1.5" data-testid="kb-new-btn"><Plus size={14} weight="bold"/> New article</Button>}
      >
        {rows.length === 0 && <div className="text-sm text-zinc-500 py-8 text-center">No articles yet.</div>}
        <div className="divide-y divide-zinc-100">
          {rows.map(a => (
            <div key={a.id} className="flex items-center gap-4 py-3" data-testid={`kb-admin-row-${a.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                  <span>/{a.slug}</span>
                  {!a.is_published && <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200 text-amber-700">DRAFT</Badge>}
                  <Badge variant="outline" className={`text-[10px] capitalize ${(!a.visible_roles || a.visible_roles.length === 0) ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-blue-50 border-blue-200 text-blue-700"}`} title={(a.visible_roles||[]).join(', ')}>
                    {audienceLabel(a.visible_roles)}
                  </Badge>
                  <span>· {a.view_count} views</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={()=>openEdit(a)} data-testid={`kb-edit-${a.id}`}><PencilSimple size={14}/></Button>
              <Button size="sm" variant="ghost" onClick={()=>del(a.id)} className="text-red-600" data-testid={`kb-del-${a.id}`}><Trash size={14}/></Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={(v)=>{ setOpen(v); if(!v) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit article" : "New article"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div>
                <Label>Title</Label>
                <Input value={editing.title} onChange={e=>setEditing(f=>({...f,title:e.target.value}))} className="mt-1" data-testid="kb-form-title"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={editing.category} onValueChange={v=>setEditing(f=>({...f,category:v}))}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Related page (optional — e.g. "onboarding", "profile.kyc")</Label>
                  <Input value={editing.related_page||""} onChange={e=>setEditing(f=>({...f,related_page:e.target.value}))} className="mt-1"/>
                </div>
              </div>
              <div>
                <Label>Excerpt (1-line summary)</Label>
                <Input value={editing.excerpt||""} onChange={e=>setEditing(f=>({...f,excerpt:e.target.value}))} className="mt-1"/>
              </div>
              <div>
                <Label>Content (Markdown)</Label>
                <Textarea
                  value={editing.content} onChange={e=>setEditing(f=>({...f,content:e.target.value}))}
                  className="mt-1 font-mono-alt text-sm" rows={18}
                  placeholder="# Heading&#10;&#10;Regular paragraph. Supports **bold**, *italic*, [links](url), tables, lists.&#10;"
                  data-testid="kb-form-content"
                />
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input value={editing.tags||""} onChange={e=>setEditing(f=>({...f,tags:e.target.value}))} className="mt-1" placeholder="basics, tour, statutory"/>
              </div>

              {/* ---- Visible-to-roles multiselect ---- */}
              <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3" data-testid="kb-roles-block">
                <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">Who can see this article?</Label>
                <p className="text-[11px] text-zinc-500 mt-0.5 mb-2">
                  Tick one or more roles. Leave empty to make it visible to everyone.
                  Admins (super, company, reseller) always see every article.
                </p>
                <div className="flex flex-wrap gap-2">
                  {audienceRoles.map(r => {
                    const on = (editing.visible_roles || []).includes(r.value);
                    return (
                      <button
                        type="button"
                        key={r.value}
                        onClick={() => toggleRole(r.value)}
                        data-testid={`kb-role-${r.value}`}
                        className={`px-2.5 py-1 text-xs rounded-full border transition ${
                          on
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {(editing.visible_roles || []).length === 0 && (
                  <div className="text-[11px] text-emerald-700 mt-2 font-medium">
                    Currently: visible to everyone (no role restriction)
                  </div>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_published} onChange={e=>setEditing(f=>({...f,is_published:e.target.checked}))}/>
                Published
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={()=>{ setOpen(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={save} data-testid="kb-form-save">Save article</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

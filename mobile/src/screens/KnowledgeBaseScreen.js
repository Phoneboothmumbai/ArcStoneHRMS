import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

/**
 * Minimal markdown renderer — just enough for KB articles. No external deps.
 * Handles: # / ## / ### headings, bullet lists, bold**, italic*, inline `code`, blank lines.
 * Complex markdown (tables, images, HTML) falls back to plain-text rendering, which is
 * acceptable here because admins write short articles.
 */
function MarkdownLite({ text }) {
  const blocks = (text || "").split(/\n{2,}/);
  return (
    <View>
      {blocks.map((block, i) => {
        const firstLine = block.split("\n")[0];
        if (firstLine.startsWith("### ")) return <Text key={i} style={md.h3}>{firstLine.slice(4)}</Text>;
        if (firstLine.startsWith("## "))  return <Text key={i} style={md.h2}>{firstLine.slice(3)}</Text>;
        if (firstLine.startsWith("# "))   return <Text key={i} style={md.h1}>{firstLine.slice(2)}</Text>;
        if (block.split("\n").every(l => /^[-*] /.test(l))) {
          return (
            <View key={i} style={{ marginVertical: 6 }}>
              {block.split("\n").map((l, j) => (
                <View key={j} style={{ flexDirection: "row", marginBottom: 4 }}>
                  <Text style={md.bullet}>• </Text>
                  <Text style={md.body}>{l.replace(/^[-*] /, "")}</Text>
                </View>
              ))}
            </View>
          );
        }
        return <Text key={i} style={md.body}>{block}</Text>;
      })}
    </View>
  );
}

const md = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: "900", color: colors.fg, marginTop: 12, marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: "800", color: colors.fg, marginTop: 10, marginBottom: 6 },
  h3: { fontSize: 15, fontWeight: "800", color: colors.fg, marginTop: 8, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 22, color: "#3f3f46", marginBottom: 8 },
  bullet: { fontSize: 14, color: "#3f3f46", lineHeight: 22 },
});

export default function KnowledgeBaseScreen() {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(null);
  const [selected, setSelected] = useState(null);   // slug of opened article
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cats, arts] = await Promise.all([
        api.get("/kb/categories").catch(() => ({ data: [] })),
        api.get("/kb/articles", { params: activeCat ? { category: activeCat } : {} }),
      ]);
      setCategories(Array.isArray(cats.data) ? cats.data : []);
      setArticles(Array.isArray(arts.data) ? arts.data : []);
    } catch (e) {
      Alert.alert("Couldn't load articles", formatError(e));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeCat]);

  // Open a single article — fetch full markdown content
  useEffect(() => {
    if (!selected) { setSelectedArticle(null); return; }
    api.get(`/kb/articles/${selected}`)
      .then(r => setSelectedArticle(r.data))
      .catch(e => { Alert.alert("Article unavailable", formatError(e)); setSelected(null); });
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(a =>
      (a.title || "").toLowerCase().includes(q) ||
      (a.excerpt || "").toLowerCase().includes(q) ||
      (a.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [articles, query]);

  // ========== Single article view ==========
  if (selected) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.articleHeader}>
          <Pressable onPress={() => { setSelected(null); setSelectedArticle(null); }} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-back" size={20} color={colors.fg}/>
            <Text style={{ color: colors.fg, fontWeight: "700", fontSize: 14 }}>Back</Text>
          </Pressable>
        </View>
        {!selectedArticle ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={colors.fg}/>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              {selectedArticle.category}
            </Text>
            <Text style={[typography.h2, { marginBottom: 4 }]}>{selectedArticle.title}</Text>
            {selectedArticle.author_name ? (
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: spacing.md }}>
                By {selectedArticle.author_name} · {selectedArticle.view_count || 0} view{selectedArticle.view_count === 1 ? "" : "s"}
              </Text>
            ) : null}
            {selectedArticle.excerpt ? (
              <View style={styles.excerptBox}>
                <Text style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>{selectedArticle.excerpt}</Text>
              </View>
            ) : null}
            <MarkdownLite text={selectedArticle.content}/>
            {selectedArticle.tags?.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                {selectedArticle.tags.map(t => (
                  <View key={t} style={styles.tag}><Text style={styles.tagText}>#{t}</Text></View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    );
  }

  // ========== List view ==========
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}
      >
        <Text style={typography.h2}>Knowledge base</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: spacing.md }}>
          How-tos, policies, and FAQs.
        </Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.muted}/>
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Search articles, tags…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted}/>
            </Pressable>
          ) : null}
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }} contentContainerStyle={{ gap: 6 }}>
          <Pressable onPress={() => setActiveCat(null)} style={[styles.catChip, !activeCat && styles.catChipActive]}>
            <Text style={[styles.catChipText, !activeCat && styles.catChipTextActive]}>All</Text>
          </Pressable>
          {categories.filter(c => c.count > 0).map(c => (
            <Pressable key={c.name} onPress={() => setActiveCat(c.name)} style={[styles.catChip, activeCat === c.name && styles.catChipActive]}>
              <Text style={[styles.catChipText, activeCat === c.name && styles.catChipTextActive]}>
                {c.name} · {c.count}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Articles list */}
        {loading && articles.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={colors.fg}/></View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={32} color={colors.muted}/>
            <Text style={{ color: colors.muted, marginTop: 8 }}>
              {query ? `No articles match "${query}"` : "No articles yet."}
            </Text>
          </View>
        ) : filtered.map(a => (
          <Pressable key={a.id || a.slug} onPress={() => setSelected(a.slug)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
            <Text style={styles.cardCat}>{a.category}</Text>
            <Text style={styles.cardTitle}>{a.title}</Text>
            {a.excerpt ? <Text style={styles.cardExcerpt} numberOfLines={2}>{a.excerpt}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 12 }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                <Ionicons name="eye-outline" size={11}/> {a.view_count || 0}
              </Text>
              {a.tags?.slice(0, 3).map(t => (
                <Text key={t} style={{ fontSize: 11, color: "#3b82f6" }}>#{t}</Text>
              ))}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 12, marginBottom: spacing.md },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.fg },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  catChipActive: { backgroundColor: colors.fg, borderColor: colors.fg },
  catChipText: { fontSize: 12, color: colors.fg, fontWeight: "600" },
  catChipTextActive: { color: "#fff" },
  card: { backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  cardCat: { fontSize: 10, color: colors.muted, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.fg, marginBottom: 4 },
  cardExcerpt: { fontSize: 13, color: "#52525b", lineHeight: 19 },
  empty: { alignItems: "center", paddingVertical: 40, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, borderStyle: "dashed" },
  articleHeader: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  excerptBox: { backgroundColor: "#f1f5f9", padding: spacing.md, borderRadius: radii.md, borderLeftWidth: 3, borderLeftColor: "#3b82f6", marginBottom: spacing.md },
  tag: { backgroundColor: "#eff6ff", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { color: "#2563eb", fontSize: 11, fontWeight: "700" },
});

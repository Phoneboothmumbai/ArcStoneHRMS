import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

function timeAgo(ts) {
  if (!ts) return "";
  const t = new Date(ts).getTime();
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get("/notifications");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      Alert.alert("Couldn't load", formatError(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markRead = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n));
    try { await api.post(`/notifications/${id}/read`); } catch {}
  };

  const markAllRead = async () => {
    const unread = items.filter(n => !n.read_at);
    if (!unread.length) return;
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    try { await api.post("/notifications/read_all"); } catch (e) { Alert.alert("Couldn't update", formatError(e)); }
  };

  const renderItem = ({ item }) => {
    const unread = !item.read_at;
    return (
      <Pressable onPress={() => markRead(item.id)} style={({ pressed }) => ({
        backgroundColor: pressed ? colors.border : (unread ? "#fef3c7" : colors.card),
        borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm,
        borderWidth: 1, borderColor: unread ? "#fde68a" : colors.border,
      })}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: colors.fg, flex: 1 }} numberOfLines={1}>{item.title || item.kind}</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{timeAgo(item.created_at)}</Text>
        </View>
        {item.body ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{item.body}</Text> : null}
        {item.kind ? <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>{item.kind}</Text> : null}
      </Pressable>
    );
  };

  const unreadCount = items.filter(n => !n.read_at).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {unreadCount > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{unreadCount} unread</Text>
          <Pressable onPress={markAllRead}>
            <Text style={{ color: colors.fg, fontWeight: "700", fontSize: 13 }}>Mark all read</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        data={items}
        keyExtractor={(it) => it.id || it.created_at}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: spacing.xxl * 2 }}>
            <Text style={[typography.h3]}>You're all caught up</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>No new notifications.</Text>
          </View>
        }
      />
    </View>
  );
}

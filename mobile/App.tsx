import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Share, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Location from 'expo-location';
import { call, setToken } from './src/api';

const P = '#4c1d95';
const Tab = createBottomTabNavigator();

function Login({ onDone }: { onDone: (u: any) => void }) {
  const [phone, setPhone] = useState(''); const [password, setPassword] = useState('');
  const go = async () => { try { const r = await call('/auth/login', 'POST', { phone, password }); setToken(r.accessToken); onDone(r.user); } catch (e: any) { Alert.alert('Login failed', e.message); } };
  return (
    <View style={s.center}>
      <Text style={s.h1}>Mehnat</Text>
      <TextInput style={s.in} placeholder="Phone (+974… / +92…)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput style={s.in} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Btn t="Login" onPress={go} />
    </View>
  );
}
const Btn = ({ t, onPress }: { t: string; onPress: () => void }) => <TouchableOpacity style={s.btn} onPress={onPress}><Text style={s.btnT}>{t}</Text></TouchableOpacity>;

function Home() {
  const tiles = [['Online Billing', '#2563eb'], ['Digital Khata', '#16a34a'], ['Find Labour', '#ea580c'], ['Book Transport', '#6d28d9']];
  return <ScrollView contentContainerStyle={{ padding: 16 }}><Text style={s.h1}>Bill • Khata • Labour • Transport</Text>
    <View style={s.grid}>{tiles.map(([t, c]) => <View key={t} style={[s.tile, { backgroundColor: c }]}><Text style={s.tileT}>{t}</Text></View>)}</View></ScrollView>;
}

function Billing() {
  const [biz, setBiz] = useState<any>(null); const [acc, setAcc] = useState<any[]>([]); const [invs, setInvs] = useState<any[]>([]);
  const [name, setName] = useState(''); const [amount, setAmount] = useState('');
  const load = async () => { try { const b = await call('/businesses'); if (b[0]) { setBiz(b[0]); setAcc(await call(`/businesses/${b[0].id}/accounts`)); setInvs(await call(`/invoices?businessId=${b[0].id}`)); } } catch {} };
  useEffect(() => { load(); }, []);
  const create = async () => {
    try {
      let b = biz; if (!b) b = await call('/businesses', 'POST', { name: 'My Business', country: 'PK' });
      let a = acc.find((x) => x.name === name); if (!a) a = await call(`/businesses/${b.id}/accounts`, 'POST', { name });
      const inv = await call('/invoices', 'POST', { businessId: b.id, accountId: a.id, items: [{ description: 'Service', quantity: 1, unitPrice: Number(amount) }] });
      await Share.share({ message: `Bill ${inv.number}: ${inv.currency} ${inv.total}\n${inv.shareUrl}` });
      setName(''); setAmount(''); load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  return <ScrollView contentContainerStyle={{ padding: 16 }}>
    <Text style={s.h2}>Create & Share Bill</Text>
    <TextInput style={s.in} placeholder="Customer name" value={name} onChangeText={setName} />
    <TextInput style={s.in} placeholder="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
    <Btn t="Create & Share Link" onPress={create} />
    <Text style={s.h2}>Invoices</Text>
    {invs.map((i) => <Text key={i.id} style={s.row}>{i.number} — {i.currency} {i.total} — {i.status}</Text>)}
  </ScrollView>;
}

function Khata() {
  const [acc, setAcc] = useState<any[]>([]); const [bal, setBal] = useState<Record<string, string>>({});
  useEffect(() => { (async () => { try { const b = await call('/businesses'); if (!b[0]) return; const a = await call(`/businesses/${b[0].id}/accounts`); setAcc(a); const m: Record<string, string> = {}; for (const x of a) m[x.id] = (await call(`/invoices/ledger/${x.id}`)).balance; setBal(m); } catch {} })(); }, []);
  return <ScrollView contentContainerStyle={{ padding: 16 }}><Text style={s.h2}>Khata Accounts</Text>
    {acc.map((a) => <Text key={a.id} style={s.row}>{a.name}: {bal[a.id] ?? '…'}</Text>)}</ScrollView>;
}

function Services() {
  const [kind, setKind] = useState<'labour' | 'truck'>('labour'); const [cat, setCat] = useState('mason'); const [msg, setMsg] = useState('');
  const book = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return Alert.alert('Location permission needed');
      const l = await Location.getCurrentPositionAsync({});
      const r = await call('/bookings', 'POST', { kind, category: cat, pickupLat: l.coords.latitude, pickupLng: l.coords.longitude });
      setMsg(`Notified ${r.notified} providers within ${r.radiusKm} km`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  return <ScrollView contentContainerStyle={{ padding: 16 }}>
    <View style={{ flexDirection: 'row', gap: 8 }}><Btn t="Labour" onPress={() => { setKind('labour'); setCat('mason'); }} /><Btn t="Transport" onPress={() => { setKind('truck'); setCat('3_ton'); }} /></View>
    <TextInput style={s.in} value={cat} onChangeText={setCat} placeholder="category e.g. mason / plumber / 3_ton / jcb" />
    <Btn t="Book Now" onPress={book} /><Text style={s.row}>{msg}</Text></ScrollView>;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  if (!user) return <Login onDone={setUser} />;
  return <NavigationContainer><Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: P }, headerTintColor: '#fff', tabBarActiveTintColor: P }}>
    <Tab.Screen name="Home" component={Home} /><Tab.Screen name="Billing" component={Billing} />
    <Tab.Screen name="Khata" component={Khata} /><Tab.Screen name="Services" component={Services} />
  </Tab.Navigator></NavigationContainer>;
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24 }, h1: { fontSize: 24, fontWeight: '800', color: P, marginBottom: 16 },
  h2: { fontSize: 18, fontWeight: '700', marginVertical: 12 }, in: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, marginBottom: 10 },
  btn: { backgroundColor: P, padding: 14, borderRadius: 12, alignItems: 'center', marginVertical: 6 }, btnT: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, tile: { width: '47%', height: 100, borderRadius: 16, padding: 12, justifyContent: 'flex-end' },
  tileT: { color: '#fff', fontWeight: '700', fontSize: 16 }, row: { paddingVertical: 8, fontSize: 15 },
});

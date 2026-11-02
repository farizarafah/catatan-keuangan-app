import { useEffect, useMemo, useState } from 'react'
import { auth, db } from './firebase'
import { signOut } from 'firebase/auth'
import { doc, setDoc, updateDoc, collection, addDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { parse, rp } from './parse'

const CATS = ['Makanan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya']
const COL = ['#F97316', '#FDBA74', '#EA580C', '#FED7AA', '#C2410C', '#FB923C', '#9A3412', '#A8A29E']
const ym = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
const sh = (m, n) => { const [y, o] = m.split('-').map(Number); return ym(new Date(y, o - 1 + n, 1)) }
const lbl = (m, o = { month: 'long', year: 'numeric' }) => { const [y, n] = m.split('-'); return new Date(y, n - 1).toLocaleDateString('id-ID', o) }
const ask = (q, d = '') => window.prompt(q, d)
const sum = (a, f) => a.reduce((s, t) => s + (f(t) ? t.amount : 0), 0)

function useCol(gid, name, ord) {
  const [d, setD] = useState([])
  useEffect(() => {
    const c = collection(db, 'groups', gid, name)
    return onSnapshot(ord ? query(c, orderBy(ord, 'desc')) : c, (s) => setD(s.docs.map((x) => ({ id: x.id, ...x.data() }))))
  }, [gid, name])
  return d
}

function Donut({ data, total }) {
  let off = 0
  return (
    <svg viewBox="0 0 100 100" width="150" aria-label="Diagram kategori">
      <g transform="rotate(-90 50 50)">
        {data.map(([c, v], i) => {
          const l = (v / total) * 251.3
          const el = <circle key={c} cx="50" cy="50" r="40" fill="none" stroke={COL[i % 8]} strokeWidth="16" strokeDasharray={`${l} 251.3`} strokeDashoffset={-off} />
          off += l
          return el
        })}
      </g>
    </svg>
  )
}

function Bars({ s }) {
  const mx = Math.max(1, ...s.flatMap((x) => [x.i, x.e]))
  return (
    <svg viewBox="0 0 300 130" width="100%" aria-label="Arus kas 6 bulan">
      {s.map((x, k) => (
        <g key={k}>
          <rect x={k * 50 + 8} y={100 - (x.i / mx) * 90} width="16" height={(x.i / mx) * 90} rx="3" fill="var(--ok)" />
          <rect x={k * 50 + 26} y={100 - (x.e / mx) * 90} width="16" height={(x.e / mx) * 90} rx="3" fill="var(--o)" />
          <text x={k * 50 + 25} y="118" fontSize="10" textAnchor="middle" fill="var(--mut)">{x.l}</text>
        </g>
      ))}
    </svg>
  )
}

export default function Main({ user, gid, onLeave }) {
  const [group, setGroup] = useState(null)
  const [tab, setTab] = useState('ringkasan')
  const [month, setMonth] = useState(ym(Date.now()))
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [acc, setAcc] = useState('')
  const [ed, setEd] = useState(null)
  const [copied, setCopied] = useState(false)
  const [th, setTh] = useState(localStorage.th || 'light')
  const gref = doc(db, 'groups', gid)
  const sub = (n, id) => (id ? doc(db, 'groups', gid, n, id) : collection(db, 'groups', gid, n))
  const txs = useCol(gid, 'tx', 'ts'), accs = useCol(gid, 'accounts'), goals = useCol(gid, 'goals'), recs = useCol(gid, 'recurring')

  useEffect(() => onSnapshot(gref, (s) => setGroup(s.data())), [gid])
  useEffect(() => { document.documentElement.dataset.theme = th; localStorage.th = th }, [th])
  useEffect(() => {
    const now = new Date(), m = ym(now)
    recs.forEach((r) => {
      if (r.last !== m && now.getDate() >= r.day) {
        setDoc(sub('tx', 'r_' + r.id + '_' + m), { type: r.type, amount: r.amount, cat: r.cat, note: r.note + ' (rutin)', acc: r.acc || '', by: user.uid, byName: 'Otomatis', ts: new Date(now.getFullYear(), now.getMonth(), r.day, 12).getTime() })
        updateDoc(sub('recurring', r.id), { last: m })
      }
    })
  }, [recs.map((r) => r.id + r.last).join()])

  const cur = useMemo(() => txs.filter((t) => ym(t.ts) === month), [txs, month])
  const inc = sum(cur, (t) => t.type === 'income'), exp = sum(cur, (t) => t.type === 'expense')
  const cats = useMemo(() => {
    const o = {}
    cur.filter((t) => t.type === 'expense').forEach((t) => (o[t.cat] = (o[t.cat] || 0) + t.amount))
    return Object.entries(o).sort((a, b) => b[1] - a[1])
  }, [cur])
  const series = [5, 4, 3, 2, 1, 0].map((n) => { const m = sh(month, -n), x = txs.filter((t) => ym(t.ts) === m); return { l: lbl(m, { month: 'short' }), i: sum(x, (t) => t.type === 'income'), e: sum(x, (t) => t.type === 'expense') } })
  const budgets = group?.budgets || {}
  const spent = Object.fromEntries(cats)
  const balOf = (a) => (a.init || 0) + sum(txs.filter((t) => t.acc === a.id), (t) => t.type === 'income') - sum(txs.filter((t) => t.acc === a.id), (t) => t.type === 'expense')

  const submit = async (e) => {
    e.preventDefault()
    const p = parse(text)
    if (!p) return setMsg('Nominal tidak terbaca. Contoh: “makan siang 50k”.')
    await addDoc(sub('tx'), { ...p, acc, by: user.uid, byName: user.displayName?.split(' ')[0] || '', ts: Date.now() })
    setMsg(`Tercatat: ${p.note} · ${p.cat} · ${rp(p.amount)}`); setText('')
  }
  const saveEd = async () => { await updateDoc(sub('tx', ed.id), { note: ed.note, amount: +ed.amount, cat: ed.cat }); setEd(null) }
  const setBudget = (c) => { const v = ask(`Budget ${c} per bulan (angka, 0 untuk hapus)`, budgets[c] || ''); if (v !== null) updateDoc(gref, { ['budgets.' + c]: +v || 0 }) }
  const addAcc = () => { const n = ask('Nama akun (mis. BCA, GoPay, Tunai)'); if (!n) return; addDoc(sub('accounts'), { name: n, init: +ask('Saldo awal (angka)', '0') || 0 }) }
  const addGoal = () => { const n = ask('Nama target (mis. Dana darurat)'); const t = +ask('Jumlah target (angka)'); if (n && t) addDoc(sub('goals'), { name: n, target: t, saved: 0 }) }
  const addRec = () => {
    const p = parse(ask('Transaksi rutin, mis. "gaji 8jt" atau "sewa 1.5jt"') || '')
    if (!p) return
    addDoc(sub('recurring'), { ...p, day: Math.min(28, +ask('Tanggal berapa tiap bulan? (1-28)', '1') || 1), acc, last: '' })
  }
  const csv = () => {
    const r = [['Tanggal', 'Jenis', 'Kategori', 'Catatan', 'Nominal', 'Oleh'], ...cur.map((t) => [new Date(t.ts).toLocaleDateString('id-ID'), t.type, t.cat, t.note, t.amount, t.byName])]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }))
    a.download = `inputin-${month}.csv`; a.click()
  }
  const copy = () => { navigator.clipboard.writeText(gid); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const leave = async () => { await setDoc(doc(db, 'users', user.uid), { groupId: null }); onLeave() }

  return (
    <div className="wrap">
      <header>
        <div className="logo">inputin</div>
        <div className="right">
          <button className="chip" onClick={copy}>{copied ? 'Tersalin' : `Kode: ${gid}`}</button>
          <button className="chip" onClick={() => setTh(th === 'dark' ? 'light' : 'dark')}>{th === 'dark' ? 'Mode terang' : 'Mode gelap'}</button>
          <button className="link" onClick={leave}>Ganti grup</button>
          <button className="link" onClick={() => signOut(auth)}>Keluar</button>
        </div>
      </header>
      <h2 className="title">{group?.name || 'Grup'} <span className="muted">{group?.members?.length || 1} anggota</span></h2>

      <form className="card chat" onSubmit={submit}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik: makan siang 50k, gaji 8jt, bensin 100rb…" />
        {accs.length > 0 && <select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">Tanpa akun</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
        <button className="btn">Catat</button>
      </form>
      {msg && <p className="ok">{msg}</p>}

      <div className="bar2">
        <div className="tabs">{[['ringkasan', 'Ringkasan'], ['transaksi', 'Transaksi'], ['kelola', 'Akun & target']].map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
        <div className="mon"><button onClick={() => setMonth(sh(month, -1))} aria-label="Bulan sebelumnya">‹</button><b>{lbl(month)}</b><button onClick={() => setMonth(sh(month, 1))} aria-label="Bulan berikutnya">›</button></div>
      </div>

      {tab === 'ringkasan' && <>
        <div className="grid">
          <div className="card"><span className="muted">Pemasukan</span><b className="pos">{rp(inc)}</b></div>
          <div className="card"><span className="muted">Pengeluaran</span><b className="neg">{rp(exp)}</b></div>
          <div className="card hl"><span>Sisa</span><b>{rp(inc - exp)}</b></div>
        </div>
        <div className="cols">
          <div className="card">
            <h3>Pengeluaran per kategori</h3>
            {!cats.length ? <p className="muted">Belum ada pengeluaran bulan ini.</p> : <div className="donut"><Donut data={cats} total={exp} /><div className="leg">{cats.map(([c, v], i) => <div key={c}><i style={{ background: COL[i % 8] }} />{c} <b>{Math.round((v / exp) * 100)}%</b></div>)}</div></div>}
          </div>
          <div className="card"><h3>Arus kas 6 bulan <small className="muted">(hijau masuk, oranye keluar)</small></h3><Bars s={series} /></div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Budget bulan ini <small className="muted">(ketuk kategori untuk mengatur)</small></h3>
          {CATS.map((c) => { const b = budgets[c], s = spent[c] || 0, p = b ? s / b : 0; return (
            <div key={c} className="bar"><div className="row"><button className="link" onClick={() => setBudget(c)}>{c}</button><span>{rp(s)}{b ? ` / ${rp(b)}` : ''}</span></div>
              <div className="track"><div className={p >= 0.9 ? 'over' : ''} style={{ width: `${Math.min(100, p * 100)}%` }} /></div></div>) })}
        </div>
      </>}

      {tab === 'transaksi' && <div className="card">
        <div className="row"><h3>Transaksi {lbl(month)}</h3><button className="chip" onClick={csv}>Ekspor CSV</button></div>
        {!cur.length && <p className="muted">Belum ada transaksi di bulan ini.</p>}
        {cur.map((t) => ed?.id === t.id ? (
          <div key={t.id} className="edit">
            <input value={ed.note} onChange={(e) => setEd({ ...ed, note: e.target.value })} />
            <input type="number" value={ed.amount} onChange={(e) => setEd({ ...ed, amount: e.target.value })} />
            <select value={ed.cat} onChange={(e) => setEd({ ...ed, cat: e.target.value })}>{[...CATS, 'Gaji', 'Pemasukan lain'].map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn" onClick={saveEd}>Simpan</button><button className="link" onClick={() => setEd(null)}>Batal</button>
          </div>
        ) : (
          <div key={t.id} className="tx">
            <div><div>{t.note}</div><small className="muted">{t.cat} · {t.byName} · {accs.find((a) => a.id === t.acc)?.name || 'Tanpa akun'} · {new Date(t.ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</small></div>
            <div className="amt"><span className={t.type === 'income' ? 'pos' : 'neg'}>{t.type === 'income' ? '+' : '−'}{rp(t.amount)}</span>
              <button className="x" aria-label="Edit" onClick={() => setEd({ id: t.id, note: t.note, amount: t.amount, cat: t.cat })}>✎</button>
              <button className="x" aria-label="Hapus" onClick={() => window.confirm('Hapus transaksi ini?') && deleteDoc(sub('tx', t.id))}>×</button></div>
          </div>
        ))}
      </div>}

      {tab === 'kelola' && <div className="cols">
        <div>
          <div className="card">
            <div className="row"><h3>Akun & saldo</h3><button className="chip" onClick={addAcc}>Tambah akun</button></div>
            {!accs.length && <p className="muted">Tambahkan bank, e-wallet, atau tunai untuk melihat saldo.</p>}
            {accs.map((a) => <div key={a.id} className="tx"><span>{a.name}</span><span className="amt"><b>{rp(balOf(a))}</b><button className="x" aria-label="Hapus" onClick={() => window.confirm('Hapus akun ini?') && deleteDoc(sub('accounts', a.id))}>×</button></span></div>)}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row"><h3>Transaksi rutin</h3><button className="chip" onClick={addRec}>Tambah</button></div>
            {!recs.length && <p className="muted">Gaji, sewa, atau langganan akan tercatat otomatis tiap bulan.</p>}
            {recs.map((r) => <div key={r.id} className="tx"><span>{r.note}<br /><small className="muted">Tanggal {r.day} · {r.cat}</small></span><span className="amt"><span className={r.type === 'income' ? 'pos' : 'neg'}>{rp(r.amount)}</span><button className="x" aria-label="Hapus" onClick={() => deleteDoc(sub('recurring', r.id))}>×</button></span></div>)}
          </div>
        </div>
        <div className="card">
          <div className="row"><h3>Target tabungan</h3><button className="chip" onClick={addGoal}>Tambah target</button></div>
          {!goals.length && <p className="muted">Buat target bersama, misalnya dana darurat atau liburan.</p>}
          {goals.map((g) => <div key={g.id} className="bar"><div className="row"><span>{g.name}</span><span>{rp(g.saved)} / {rp(g.target)}</span></div>
            <div className="track"><div style={{ width: `${Math.min(100, (g.saved / g.target) * 100)}%` }} /></div>
            <button className="link" onClick={() => { const n = +ask('Tambah tabungan (Rp)'); if (n) updateDoc(sub('goals', g.id), { saved: g.saved + n }) }}>Isi tabungan</button>
            <button className="link" onClick={() => window.confirm('Hapus target ini?') && deleteDoc(sub('goals', g.id))}>Hapus</button></div>)}
        </div>
      </div>}
    </div>
  )
}

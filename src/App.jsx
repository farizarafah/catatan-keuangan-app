import { useEffect, useMemo, useState } from 'react'
import { auth, db, provider } from './firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, collection, addDoc,
  deleteDoc, onSnapshot, query, orderBy,
} from 'firebase/firestore'
import { parse, rp } from './parse'

const genCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

export default function App() {
  const [user, setUser] = useState(undefined)
  const [gid, setGid] = useState(undefined)

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u)
    if (!u) return setGid(undefined)
    const s = await getDoc(doc(db, 'users', u.uid))
    setGid(s.exists() ? s.data().groupId : null)
  }), [])

  if (user === undefined || (user && gid === undefined)) return <div className="center">Memuat…</div>
  if (!user) return <Login />
  if (!gid) return <Setup user={user} onDone={setGid} />
  return <Main user={user} gid={gid} onLeave={() => setGid(null)} />
}

function Login() {
  return (
    <div className="center">
      <div className="card login">
        <div className="logo">inputin</div>
        <h1>Catat keuangan keluarga, cukup dengan mengetik.</h1>
        <p className="muted">Tulis “makan siang 50k” atau “gaji 8jt”, sisanya diatur otomatis.</p>
        <button className="btn" onClick={() => signInWithPopup(auth, provider)}>Masuk dengan Google</button>
      </div>
    </div>
  )
}

function Setup({ user, onDone }) {
  const [name, setName] = useState('Keluarga')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const finish = async (id) => { await setDoc(doc(db, 'users', user.uid), { groupId: id }); onDone(id) }
  const create = async () => {
    const id = genCode()
    await setDoc(doc(db, 'groups', id), { name, members: [user.uid], createdAt: Date.now() })
    finish(id)
  }
  const join = async () => {
    const id = code.trim().toUpperCase()
    try {
      const s = await getDoc(doc(db, 'groups', id))
      if (!s.exists()) return setErr('Kode tidak ditemukan. Periksa lagi kodenya.')
      await updateDoc(doc(db, 'groups', id), { members: arrayUnion(user.uid) })
      finish(id)
    } catch { setErr('Gagal bergabung. Coba lagi.') }
  }
  return (
    <div className="center">
      <div className="card setup">
        <h2>Halo, {user.displayName?.split(' ')[0]}</h2>
        <p className="muted">Buat grup baru atau gabung ke grup keluarga dengan kode.</p>
        <label>Nama grup</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" onClick={create}>Buat grup</button>
        <div className="sep">atau</div>
        <label>Kode grup</label>
        <input value={code} maxLength={6} placeholder="Contoh: K7M2QX" onChange={(e) => { setCode(e.target.value); setErr('') }} />
        {err && <p className="err">{err}</p>}
        <button className="btn ghost" disabled={code.length < 6} onClick={join}>Gabung grup</button>
        <button className="link" onClick={() => signOut(auth)}>Keluar</button>
      </div>
    </div>
  )
}

function Main({ user, gid, onLeave }) {
  const [group, setGroup] = useState(null)
  const [txs, setTxs] = useState([])
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'groups', gid)).then((s) => setGroup(s.data()))
    return onSnapshot(query(collection(db, 'groups', gid, 'tx'), orderBy('ts', 'desc')),
      (s) => setTxs(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [gid])

  const month = new Date().toISOString().slice(0, 7)
  const stat = useMemo(() => {
    const cur = txs.filter((t) => new Date(t.ts).toISOString().slice(0, 7) === month)
    const inc = cur.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)
    const exp = cur.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
    const byCat = {}
    cur.filter((t) => t.type === 'expense').forEach((t) => (byCat[t.cat] = (byCat[t.cat] || 0) + t.amount))
    return { inc, exp, cats: Object.entries(byCat).sort((a, b) => b[1] - a[1]) }
  }, [txs, month])

  const submit = async (e) => {
    e.preventDefault()
    const p = parse(text)
    if (!p) return setMsg('Nominal tidak terbaca. Contoh: “makan siang 50k”.')
    await addDoc(collection(db, 'groups', gid, 'tx'), { ...p, by: user.uid, byName: user.displayName?.split(' ')[0] || '', ts: Date.now() })
    setMsg(`Tercatat: ${p.note} · ${p.cat} · ${rp(p.amount)}`)
    setText('')
  }
  const copy = () => { navigator.clipboard.writeText(gid); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const leave = async () => { await setDoc(doc(db, 'users', user.uid), { groupId: null }); onLeave() }

  return (
    <div className="wrap">
      <header>
        <div className="logo">inputin</div>
        <div className="right">
          <button className="chip" onClick={copy}>{copied ? 'Tersalin' : `Kode: ${gid}`}</button>
          <button className="link" onClick={leave}>Ganti grup</button>
          <button className="link" onClick={() => signOut(auth)}>Keluar</button>
        </div>
      </header>
      <h2 className="title">{group?.name || 'Grup'} <span className="muted">{group?.members?.length || 1} anggota</span></h2>

      <form className="card chat" onSubmit={submit}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik: makan siang 50k, gaji 8jt, bensin 100rb…" />
        <button className="btn">Catat</button>
      </form>
      {msg && <p className="ok">{msg}</p>}

      <div className="grid">
        <div className="card"><span className="muted">Pemasukan bulan ini</span><b className="pos">{rp(stat.inc)}</b></div>
        <div className="card"><span className="muted">Pengeluaran bulan ini</span><b className="neg">{rp(stat.exp)}</b></div>
        <div className="card hl"><span>Sisa bulan ini</span><b>{rp(stat.inc - stat.exp)}</b></div>
      </div>

      <div className="cols">
        <div className="card">
          <h3>Pengeluaran per kategori</h3>
          {!stat.cats.length && <p className="muted">Belum ada pengeluaran bulan ini.</p>}
          {stat.cats.map(([c, v]) => (
            <div key={c} className="bar">
              <div className="row"><span>{c}</span><span>{rp(v)}</span></div>
              <div className="track"><div style={{ width: `${(v / stat.exp) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Transaksi terbaru</h3>
          {!txs.length && <p className="muted">Belum ada transaksi. Ketik yang pertama di atas.</p>}
          {txs.slice(0, 50).map((t) => (
            <div key={t.id} className="tx">
              <div>
                <div>{t.note}</div>
                <small className="muted">{t.cat} · {t.byName} · {new Date(t.ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</small>
              </div>
              <div className="amt">
                <span className={t.type === 'income' ? 'pos' : 'neg'}>{t.type === 'income' ? '+' : '−'}{rp(t.amount)}</span>
                <button className="x" aria-label="Hapus" onClick={() => deleteDoc(doc(db, 'groups', gid, 'tx', t.id))}>×</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

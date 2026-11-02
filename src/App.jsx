import { useEffect, useMemo, useState } from 'react'
import { auth, db, provider } from './firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, collection, addDoc,
  deleteDoc, onSnapshot, query, orderBy,
} from 'firebase/firestore'
import Main from './Main'

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

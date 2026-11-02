export const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID')

const CATS = {
  Makanan: /makan|lunch|dinner|breakfast|sarapan|kopi|coffee|cafe|kafe|snack|jajan|bakso|nasi|ayam|food|resto|minum/,
  Transport: /bensin|bbm|grab|gojek|ojek|parkir|tol|taxi|taksi|transport|bus|krl|mrt|fuel|gas/,
  Belanja: /belanja|shopping|indomaret|alfamart|supermarket|groceries|tokopedia|shopee|baju/,
  Tagihan: /listrik|pln|air|pdam|wifi|internet|pulsa|kuota|tagihan|bill|sewa|rent|cicilan|kost/,
  Hiburan: /netflix|spotify|nonton|bioskop|game|movie|hiburan|liburan/,
  Kesehatan: /obat|dokter|rs |klinik|apotek|health|vitamin/,
  Pendidikan: /sekolah|spp|kuliah|buku|kursus|les/,
}
const INCOME = /gaji|salary|paid|income|bonus|terima|dapat|thr|untung|freelance|transfer masuk|got/
const INCOME_CAT = /gaji|salary|paid/

export function parse(text) {
  const t = text.toLowerCase().trim()
  const m = t.match(/(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(juta|jt|m|ribu|rb|k)?\b/)
  if (!m) return null
  let n = m[1]
  n = /^\d{1,3}(\.\d{3})+$/.test(n) ? n.replace(/\./g, '') : n.replace(',', '.')
  let amount = parseFloat(n)
  const u = m[2]
  if (u === 'k' || u === 'rb' || u === 'ribu') amount *= 1e3
  if (u === 'm' || u === 'jt' || u === 'juta') amount *= 1e6
  if (!amount) return null
  const type = INCOME.test(t) ? 'income' : 'expense'
  let cat = type === 'income' ? (INCOME_CAT.test(t) ? 'Gaji' : 'Pemasukan lain') : 'Lainnya'
  if (type === 'expense') for (const [k, re] of Object.entries(CATS)) if (re.test(t)) { cat = k; break }
  const note = text.replace(m[0], '').replace(/\s+/g, ' ').trim() || cat
  return { type, amount, cat, note }
}

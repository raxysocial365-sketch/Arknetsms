/* ============================================================
   ARKNET — FIREBASE CONFIG + HELPERS
   Shared across all pages
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField,
  collection, addDoc, query, orderBy, where, getDocs,
  serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFm455uDjJ8z8mtMTHvas7ikT0zsS7Je8",
  authDomain: "arknetsms-430ee.firebaseapp.com",
  projectId: "arknetsms-430ee",
  storageBucket: "arknetsms-430ee.firebasestorage.app",
  messagingSenderId: "961504742152",
  appId: "1:961504742152:web:a9ade98d13465bb3b8babd",
  measurementId: "G-48V2T4CBJF"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteField,
  collection, addDoc, query, orderBy, where, getDocs,
  serverTimestamp, deleteDoc
};

/* ============ CONFIG ============ */
export const API_URL = "/api/autofications-buy";
export const TV_API_URL = "/api/textverified-buy";
export const USD_TO_NGN = 1550;
export const PROFIT_NGN = 850;

/* ============ HELPERS ============ */
export const formatNGN = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatNGNshort = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
export const capitalize = (v) => String(v || '').replace(/\b\w/g, c => c.toUpperCase());
export const escapeHtml = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

export function showToast(text, type = '') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.className = 'toast show ' + type;
  setTimeout(() => toast.className = 'toast ' + type, 2800);
}

export function calculateCustomerPrice(providerUsdPrice){
  const usd = Number(providerUsdPrice || 0);
  return Math.ceil((usd * USD_TO_NGN) + PROFIT_NGN);
}
export function calculateProviderCostNgn(providerUsdPrice){
  const usd = Number(providerUsdPrice || 0);
  return Math.ceil(usd * USD_TO_NGN);
}

/* ============ MODAL ============ */
export function openModal(html){
  let overlay = document.getElementById('purchaseModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'purchaseModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal-box" id="modalContent"></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  }
  document.getElementById('modalContent').innerHTML = html;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}
export function closeModal(){
  const overlay = document.getElementById('purchaseModal');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
}

/* ============ STATE ============ */
export let currentUser = null;
export let currentBalance = 0;

export function setBalance(v) { currentBalance = Number(v || 0); }

export function updateBalanceUI(){
  const txt = formatNGN(currentBalance);
  const topBal = document.getElementById('topBalance');
  const depositBal = document.getElementById('depositBalance');
  if (topBal) topBal.textContent = txt;
  if (depositBal) depositBal.textContent = txt;
}

export async function saveBalance(){
  if (!currentUser) return;
  await setDoc(doc(db, 'users', currentUser.uid), { wallet: currentBalance }, { merge: true });
  updateBalanceUI();
}

export async function addTransaction(data){
  if (!currentUser) return;
  await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), { ...data, createdAt: serverTimestamp() });
}

/* ============ INIT PAGE ============ */
/* Call on every page. Pass onReady(user) to run page setup. */
export function initPage(onReady) {
  // Menu button
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('show');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  const bnLogout = document.getElementById('bnLogout');
  const doLogout = async () => {
    await signOut(auth);
    window.location.replace('login.html');
  };
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  if (bnLogout) bnLogout.addEventListener('click', doLogout);

  // Auth guard
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;

    const name = user.displayName || 'User';
    const sideName = document.getElementById('sideName');
    const sideEmail = document.getElementById('sideEmail');
    const sideAvatar = document.getElementById('sideAvatar');
    if (sideName) sideName.textContent = name;
    if (sideEmail) sideEmail.textContent = user.email;
    if (sideAvatar) sideAvatar.textContent = name.charAt(0).toUpperCase();

    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        currentBalance = Number(data.wallet ?? data.walletBalance ?? data.balance ?? 0);
        updateBalanceUI();
      }
    } catch (e) { console.warn(e); }

    if (onReady) onReady(user, currentBalance);
  });
}

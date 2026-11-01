import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { ENABLE_GOOGLE } from './config.js';

const ROUTES = ['submit', 'signin', 'mine', 'admin'];
const go = (p) => { location.hash = '/' + p; };
const fmt = (t) => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';

function useRoute() {
  const read = () => { const h = location.hash.slice(2); return ROUTES.includes(h) ? h : 'submit'; }; // unknown hashes (e.g. auth tokens) fall back to submit
  const [r, setR] = useState(read);
  useEffect(() => { const f = () => setR(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}

function useAuth() {
  const [session, setSession] = useState(undefined), [profile, setProfile] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return setProfile(null);
    supabase.from('profiles').select('display_name,is_admin').eq('id', session.user.id).single().then(({ data }) => setProfile(data));
  }, [session]);
  return { session, profile };
}

const Logo = () => (<svg width="30" height="30" viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="8" fill="#5146C6" /><path d="M19.58 19.58V10.42H10.42M19.58 10.42L10.42 19.58" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></svg>);

function SignIn() {
  const [email, setEmail] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const redirectTo = location.origin + location.pathname;
  const magic = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setBusy(false); setMsg(error ? error.message : 'Check your inbox for the sign-in link.');
  };
  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  return (
    <section className="panel">
      <h1>Found a good thing? Pass it on.</h1>
      <p className="sub">Sign in to submit free opportunities and help someone take their next step.</p>
      {ENABLE_GOOGLE && <><button className="btn ghost" onClick={google}>Continue with Google</button><div className="or">or use email</div></>}
      <form onSubmit={magic}>
        <label>Email address<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" /></label>
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
      </form>
      {msg && <p className="note">{msg}</p>}
      <p className="fine">No password to remember. Any email address works. Browsing and saving in the extension never need an account.</p>
    </section>
  );
}

function Submit({ session }) {
  const blank = { title: '', url: '', type: 'certification', deadline: '', who: '', perk: '', free: false };
  const [f, setF] = useState(blank), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  if (!session) return (<section className="panel"><h1>Good finds deserve company.</h1><p className="sub">Sign in to share a free opportunity with the community.</p><button className="btn" onClick={() => go('signin')}>Sign in</button></section>);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await supabase.from('listings').insert({
      title: f.title.trim(), url: f.url.trim(), type: f.type, who: f.who.trim() || null, perk: f.perk.trim() || 'Free',
      deadline: new Date(f.deadline + ':00+05:30').toISOString(), submitted_by: session.user.id,
    });
    setBusy(false);
    if (!error) { setF(blank); return setMsg({ ok: true, text: 'Thanks! Your submission is waiting for review.' }); }
    setMsg({ text: error.code === '23505' ? 'This link is already on the board (or waiting for review).' : error.message });
  };
  return (
    <section className="panel">
      <h1>Good finds deserve company.</h1><p className="sub">Share a free opportunity with the community.</p>
      <form onSubmit={send}>
        <label>Opportunity title<input required minLength={3} maxLength={140} value={f.title} onChange={set('title')} /></label>
        <label>Official opportunity link<input required type="url" value={f.url} onChange={set('url')} placeholder="https://" /></label>
        <div className="two">
          <label>Type<select value={f.type} onChange={set('type')}><option value="certification">Certification</option><option value="hackathon">Hackathon</option><option value="scholarship">Scholarship</option></select></label>
          <label>Deadline (IST)<input required type="datetime-local" value={f.deadline} onChange={set('deadline')} /></label>
        </div>
        <label>Who can apply?<input maxLength={140} value={f.who} onChange={set('who')} placeholder="India · Students 18+ · Teams of 2–4" /></label>
        <label>What's free?<input maxLength={80} value={f.perk} onChange={set('perk')} placeholder="Course + certificate free" /></label>
        <label className="check"><input type="checkbox" required checked={f.free} onChange={set('free')} /> <span>Free to enter. No required purchase. For courses, the certificate must also be free.</span></label>
        <p className="note">A human reviews every submission before it joins the board. No paid or referral-only listings.</p>
        <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit for community review'}</button>
      </form>
      {msg && <p className={'note ' + (msg.ok ? 'good' : 'bad')}>{msg.text}</p>}
    </section>
  );
}

const Pill = ({ s }) => <span className={'pill ' + s}>{s}</span>;

function Mine({ session }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { if (session) supabase.from('listings').select('id,title,url,status,deadline').eq('submitted_by', session.user.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data || [])); }, [session]);
  if (!session) return <section className="panel"><p>Please <a href="#/signin">sign in</a> first.</p></section>;
  return (
    <section className="panel"><h1>My submissions</h1>
      {rows === null ? <p className="sub">Loading…</p> : !rows.length ? <p className="sub">Nothing yet. <a href="#/submit">Submit your first one.</a></p> :
        rows.map((r) => <div className="item" key={r.id}><div><b>{r.title}</b><small>Deadline {fmt(r.deadline)}</small></div><Pill s={r.status} /></div>)}
    </section>
  );
}

function Admin({ profile }) {
  const [rows, setRows] = useState(null);
  const load = () => supabase.from('listings').select('*, profiles(display_name)').eq('status', 'pending').order('created_at').then(({ data }) => setRows(data || []));
  useEffect(() => { if (profile?.is_admin) load(); }, [profile]);
  if (!profile?.is_admin) return <section className="panel"><p>Admins only.</p></section>;
  const decide = async (id, status) => { const { error } = await supabase.from('listings').update({ status }).eq('id', id); if (!error) setRows((r) => r.filter((x) => x.id !== id)); else alert(error.message); };
  return (
    <section className="panel wide"><h1>Review queue</h1>
      {rows === null ? <p className="sub">Loading…</p> : !rows.length ? <p className="sub">No pending submissions.</p> :
        rows.map((r) => (
          <div className="item col" key={r.id}>
            <div><b>{r.title}</b> <small>{r.type} · by {r.profiles?.display_name || 'unknown'}</small></div>
            <small>Deadline {fmt(r.deadline)} · {r.who || 'no eligibility given'} · {r.perk}</small>
            <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a>
            <div className="acts"><button className="btn sm" onClick={() => decide(r.id, 'approved')}>Approve</button><button className="btn sm ghost" onClick={() => decide(r.id, 'rejected')}>Reject</button></div>
          </div>))}
    </section>
  );
}

export default function App() {
  const route = useRoute(), { session, profile } = useAuth();
  useEffect(() => { if (session && route === 'signin') go('submit'); }, [session, route]);
  if (session === undefined) return null;
  return (
    <>
      <header><a className="brand" href="#/submit"><Logo /> DevReward</a>
        <nav>
          <a href="#/submit" className={route === 'submit' ? 'on' : ''}>Submit</a>
          {session && <a href="#/mine" className={route === 'mine' ? 'on' : ''}>My submissions</a>}
          {profile?.is_admin && <a href="#/admin" className={route === 'admin' ? 'on' : ''}>Review</a>}
          {session ? <button onClick={() => supabase.auth.signOut()}>Sign out</button> : <a href="#/signin" className={route === 'signin' ? 'on' : ''}>Sign in</a>}
        </nav></header>
      <main>
        {route === 'signin' && <SignIn />}
        {route === 'submit' && <Submit session={session} />}
        {route === 'mine' && <Mine session={session} />}
        {route === 'admin' && <Admin profile={profile} />}
      </main>
      <footer>Always check the official page before applying.</footer>
    </>
  );
}

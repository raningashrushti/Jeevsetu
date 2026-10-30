import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardList,
  Heart,
  MapPin,
  Mic,
  PawPrint,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Volume2,
  X
} from 'lucide-react';
import './styles.css';
import VolunteerLogin from './VolunteerLogin.jsx';
import { supabase } from './supabase.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const statuses = ['New', 'Reviewing', 'Assigned', 'Resolved'];

const sampleReports = [
  {
    id: 'JS-DEMO01',
    animalType: 'Dog',
    location: 'Near the public garden, Chandrapur',
    description:
      'A stray dog appears to be limping. Exact condition needs volunteer review.',
    language: 'Marathi',
    status: 'New',
    createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    duplicateOf: null
  },
  {
    id: 'JS-DEMO02',
    animalType: 'Cat',
    location: 'Lane behind the market, Rajura',
    description:
      'Small cat reported alone near the shops. Reporter could not confirm whether it is injured.',
    language: 'Hindi',
    status: 'Reviewing',
    createdAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    duplicateOf: null
  },
  {
    id: 'JS-DEMO03',
    animalType: 'Bird',
    location: 'College road, Chandrapur',
    description:
      'Bird on the ground; condition and exact location require checking.',
    language: 'English',
    status: 'Assigned',
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    duplicateOf: null
  }
];

function App() {
  const [reports, setReports] = useState([]);
  const [demoMode, setDemoMode] = useState(false);
  const [view, setView] = useState('home');
  const [volunteer, setVolunteer] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    animalType: 'Dog',
    location: '',
    description: '',
    language: 'Marathi'
  });

  const [saving, setSaving] = useState(false);
  const [speechMessage, setSpeechMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimeoutRef = useRef(null);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    return data.session?.access_token || null;
  }

  async function loadReports() {
    setLoading(true);
    setNotice('');

    try {
      const token = await getAccessToken();

      if (!token) {
        setReports([]);
        setVolunteer(null);
        setView('login');
        setNotice('Please sign in with an approved volunteer account.');
        return;
      }

      const response = await fetch(`${API}/api/reports`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReports([]);
          setVolunteer(null);
          setView('home');
          setNotice(
            data.error ||
              'Your account is not approved for volunteer access.'
          );

          await supabase.auth.signOut();
          return;
        }

        throw new Error(
          data.error || 'Unable to load rescue reports.'
        );
      }

      setReports(data.reports || []);
      setDemoMode(false);
    } catch (error) {
      setReports([]);
      setDemoMode(false);
      setNotice(
        error.message ||
          'Unable to load rescue reports. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;

      if (error) {
        setNotice(
          'Could not restore your login session. Please sign in again.'
        );
        return;
      }

      setVolunteer(data.session?.user || null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;

        setVolunteer(session?.user || null);

        if (!session && view === 'dashboard') {
          setReports([]);
          setView('home');
        }
      }
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (view === 'dashboard' && !volunteer) {
      setReports([]);
      setView('login');
      setNotice('Please sign in to access the rescue dashboard.');
    }
  }, [view, volunteer]);

  useEffect(() => {
    if (view === 'dashboard' && volunteer) {
      loadReports();
    }
  }, [view, volunteer]);

  const filteredReports = useMemo(
    () =>
      reports.filter((report) => {
        const text =
          `${report.id} ${report.animalType} ${report.location} ${report.description}`.toLowerCase();

        return (
          (!query || text.includes(query.toLowerCase())) &&
          (filter === 'All' || report.status === filter)
        );
      }),
    [reports, query, filter]
  );

  const counts = useMemo(
    () => ({
      total: reports.length,
      new: reports.filter((report) => report.status === 'New').length,
      active: reports.filter((report) =>
        ['Reviewing', 'Assigned'].includes(report.status)
      ).length,
      resolved: reports.filter(
        (report) => report.status === 'Resolved'
      ).length
    }),
    [reports]
  );

  // Gnani AI voice recording and transcription.
  // The browser records PCM samples and packages them as WAV.
  async function startDictation(field = 'description') {
    // Clicking the button a second time stops and transcribes the recording.
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (
      !navigator.mediaDevices?.getUserMedia ||
      !AudioContextClass
    ) {
      setSpeechMessage(
        'Audio recording is not supported in this browser. Please type your report instead.'
      );
      return;
    }

    let stream;
    let audioContext;
    let source;
    let processor;

    try {
      setSpeechMessage('Requesting microphone access…');

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      audioContext = new AudioContextClass();
      await audioContext.resume();

      const sampleRate = audioContext.sampleRate;

      source = audioContext.createMediaStreamSource(stream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);

      audioChunksRef.current = [];

      const recording = {
        state: 'recording',
        stop: null
      };

      processor.onaudioprocess = (event) => {
        if (recording.state !== 'recording') return;

        audioChunksRef.current.push(
          new Float32Array(
            event.inputBuffer.getChannelData(0)
          )
        );

        // Send silence to output to avoid microphone feedback.
        event.outputBuffer.getChannelData(0).fill(0);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      const stopAndTranscribe = async () => {
        if (recording.state !== 'recording') return;

        recording.state = 'stopping';

        setIsRecording(false);
        setIsTranscribing(true);
        setSpeechMessage('Preparing WAV audio for Gnani AI…');

        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }

        processor.onaudioprocess = null;

        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];

        try {
          source.disconnect();
        } catch {}

        try {
          processor.disconnect();
        } catch {}

        stream.getTracks().forEach((track) => track.stop());

        try {
          if (audioContext.state !== 'closed') {
            await audioContext.close();
          }
        } catch {}

        mediaRecorderRef.current = null;

        try {
          const totalSamples = chunks.reduce(
            (total, chunk) => total + chunk.length,
            0
          );

          if (totalSamples < 1024) {
            throw new Error(
              'The recording was too short. Please try again.'
            );
          }

          // Combine the captured microphone samples.
          const samples = new Float32Array(totalSamples);

          let offset = 0;

          for (const chunk of chunks) {
            samples.set(chunk, offset);
            offset += chunk.length;
          }

          // Create a standard 16-bit mono PCM WAV file.
          const bytesPerSample = 2;
          const dataSize = samples.length * bytesPerSample;

          const wavBuffer = new ArrayBuffer(44 + dataSize);
          const view = new DataView(wavBuffer);

          const writeText = (position, value) => {
            for (let i = 0; i < value.length; i++) {
              view.setUint8(
                position + i,
                value.charCodeAt(i)
              );
            }
          };

          // WAV header.
          writeText(0, 'RIFF');
          view.setUint32(4, 36 + dataSize, true);
          writeText(8, 'WAVE');
          writeText(12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 1, true);
          view.setUint32(24, sampleRate, true);
          view.setUint32(
            28,
            sampleRate * bytesPerSample,
            true
          );
          view.setUint16(32, bytesPerSample, true);
          view.setUint16(34, 16, true);
          writeText(36, 'data');
          view.setUint32(40, dataSize, true);

          // Convert floating-point samples to signed 16-bit PCM.
          for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(
              -1,
              Math.min(1, samples[i])
            );

            view.setInt16(
              44 + i * bytesPerSample,
              sample < 0
                ? sample * 0x8000
                : sample * 0x7fff,
              true
            );
          }

          const wavBlob = new Blob([wavBuffer], {
            type: 'audio/wav'
          });

          if (wavBlob.size > 5 * 1024 * 1024) {
            throw new Error(
              'The recording exceeds the 5 MB limit. Please record a shorter report.'
            );
          }

          const languageCodes = {
            Marathi: 'mr-IN',
            Hindi: 'hi-IN',
            English: 'en-IN',
            Hinglish: 'indic-auto'
          };

          const upload = new FormData();

          // IMPORTANT: the active backend expects the field "audio".
          upload.append(
            'audio',
            wavBlob,
            'rescue-report.wav'
          );

          // The active backend reads req.body.languageCode.
          upload.append(
            'languageCode',
            languageCodes[form.language] || 'indic-auto'
          );

          setSpeechMessage('Sending WAV recording to Gnani AI…');

          const response = await fetch(`${API}/api/transcribe`, {
            method: 'POST',
            body: upload
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Transcription failed (HTTP ${response.status}).`
            );
          }

          const transcript =
            typeof data.transcript === 'string'
              ? data.transcript
              : typeof data.transcript?.transcript === 'string'
                ? data.transcript.transcript
                : '';

          if (!transcript.trim()) {
            throw new Error(
              'Gnani AI returned an empty transcript. Please try again.'
            );
          }

          // Insert the transcript into the selected field.
          setForm((old) => ({
            ...old,
            [field]: old[field]?.trim()
              ? `${old[field].trim()} ${transcript.trim()}`.slice(
                  0,
                  1200
                )
              : transcript.trim().slice(0, 1200)
          }));

          setSpeechMessage(
            'Gnani AI transcription received. Review the description before submitting.'
          );
        } catch (error) {
          setSpeechMessage(
            error.message ||
              'Transcription failed. Please try again.'
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      // The button calls .stop() on this recording handle.
      recording.stop = stopAndTranscribe;
      mediaRecorderRef.current = recording;

      setIsRecording(true);

      setSpeechMessage(
        'Recording… speak clearly, then press Stop & transcribe. Maximum 25 seconds.'
      );

      // Automatically stop before the transcription service time limit.
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current === recording) {
          stopAndTranscribe();
        }
      }, 25000);
    } catch (error) {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      try {
        source?.disconnect();
      } catch {}

      try {
        processor?.disconnect();
      } catch {}

      stream?.getTracks().forEach((track) => track.stop());

      try {
        if (
          audioContext &&
          audioContext.state !== 'closed'
        ) {
          await audioContext.close();
        }
      } catch {}

      mediaRecorderRef.current = null;
      setIsRecording(false);
      setIsTranscribing(false);

      setSpeechMessage(
        error.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow access and try again.'
          : error.message || 'Could not start recording.'
      );
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    setNotice('');

    if (
      form.location.trim().length < 3 ||
      form.description.trim().length < 10
    ) {
      setNotice(
        'Please add a specific location and a little more detail.'
      );
      return;
    }

    setSaving(true);

    const payload = {
      ...form,
      source: 'typed-or-gnani-transcription'
    };

    try {
      const response = await fetch(`${API}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to submit report.'
        );
      }

      setNotice(
        data.duplicateWarning ||
          `Report ${data.report.id} submitted. Thank you for helping an animal.`
      );

      setForm({
        animalType: 'Dog',
        location: '',
        description: '',
        language: 'Marathi'
      });

      setView('home');
    } catch (error) {
      setNotice(error.message || 'Unable to submit the report.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(report, status) {
    try {
      const token = await getAccessToken();

      if (!token) {
        setReports([]);
        setVolunteer(null);
        setView('login');
        setNotice('Please sign in to update a rescue report.');
        return;
      }

      const response = await fetch(
        `${API}/api/reports/${report.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ status })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not update status.');
      }

      setReports((old) =>
        old.map((item) =>
          item.id === report.id ? data.report : item
        )
      );
    } catch (error) {
      setNotice(error.message || 'Could not update status.');
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <PawPrint size={23} />
          </div>

          <div>
            <strong>JeevSetu</strong>
            <span>ANIMAL RESCUE NETWORK</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <button
          className={`nav-item ${view === 'home' ? 'active' : ''}`}
          onClick={() => {
            setNotice('');
            setView('home');
          }}
        >
          <Heart size={18} /> Home
        </button>

        <button
          className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => {
            setNotice('');
            setView(volunteer ? 'dashboard' : 'login');
          }}
        >
          <ClipboardList size={18} /> Rescue dashboard
        </button>

        <button
          className={`nav-item ${view === 'report' ? 'active' : ''}`}
          onClick={() => {
            setNotice('');
            setView('report');
          }}
        >
          <Plus size={18} /> Create a report
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-heart">
            <Heart size={19} />
          </div>

          <strong>Every voice can help.</strong>

          <p>
            Making animal rescue reports clearer, one conversation at a time.
          </p>

          <div className="privacy-note">
            <ShieldCheck size={15} /> Volunteer-reviewed reports
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <PawPrint size={20} /> JeevSetu
          </div>

          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            {view === 'home'
              ? 'Home'
              : view === 'login'
                ? 'Volunteer login'
                : view === 'dashboard'
                  ? 'Rescue dashboard'
                  : 'New report'}
          </div>

          <div className="topbar-right">
            <span className={`mode-pill ${demoMode ? 'demo' : 'live'}`}>
              <span />
              {demoMode ? 'Preview mode' : 'API connected'}
            </span>

            {volunteer ? (
              <button
                className="secondary-btn"
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setVolunteer(null);
                  setReports([]);
                  setNotice('You have been signed out.');
                  setView('home');
                }}
              >
                Sign out
              </button>
            ) : null}

            <div className="avatar">
              {volunteer ? 'V' : 'JS'}
            </div>
          </div>
        </header>

        {notice && (
          <div className="notice">
            <AlertCircle size={17} />
            <span>{notice}</span>

            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {view === 'home' ? (
          <>
            <section className="home-hero home-hero-new">
              <div className="home-hero-copy">
                <div className="eyebrow">
                  <PawPrint size={15} /> EVERY LIFE MATTERS
                </div>

                <h1>
                  Together, we can
                  <br />
                  <span>save more lives.</span>
                </h1>

                <p className="subheading">
                  Found a little soul who needs help? You don't have to figure
                  it out alone. Let's take the first step together.
                </p>

                <div className="home-actions">
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setNotice('');
                      setView('report');
                    }}
                  >
                    <Heart size={17} />
                    Help an Animal
                    <ArrowRight size={17} />
                  </button>

                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setNotice('');
                      setView('login');
                    }}
                  >
                    <ShieldCheck size={17} />
                    Volunteer Login
                  </button>
                </div>

                <div className="home-note">
                  <Heart size={16} />
                  Every little life deserves kindness, care, and a chance.
                </div>
              </div>

              <div className="home-hero-visual">
                <div className="home-photo-frame">
                  <img
                    src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=85"
                    alt="A friendly golden dog"
                  />
                </div>

                <div className="home-photo-small">
                  <img
                    src="https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=85"
                    alt="A cat looking curiously at the camera"
                  />
                </div>

                <div className="home-photo-note">
                  <Heart size={17} />
                  <span>
                    <strong>Every life matters</strong>
                    <small>Love makes a difference.</small>
                  </span>
                </div>
              </div>
            </section>

            <section className="home-features">
              <article>
                <div className="aside-icon">
                  <Mic size={22} />
                </div>

                <h3>Easy reporting</h3>

                <p>
                  Share an animal's location and describe what you observed.
                </p>
              </article>

              <article>
                <div className="aside-icon">
                  <ClipboardList size={22} />
                </div>

                <h3>Organized cases</h3>

                <p>
                  Keep rescue reports organized by their current status.
                </p>
              </article>

              <article>
                <div className="aside-icon">
                  <Heart size={22} />
                </div>

                <h3>Community care</h3>

                <p>
                  Help volunteers review reports and coordinate next steps.
                </p>
              </article>
            </section>
          </>
        ) : view === 'login' ? (
          <VolunteerLogin
            onLogin={(user) => {
              setVolunteer(user);
              setNotice('');
              setView('dashboard');
            }}
            onBack={() => setView('home')}
          />
        ) : view === 'dashboard' ? (
          <>
            <section className="welcome-row">
              <div>
                <div className="eyebrow">
                  <Sparkles size={14} /> COMMUNITY-POWERED RESCUE
                </div>

                <h1>Rescue dashboard</h1>

                <p className="subheading">
                  Turn reports into organized action. Every case deserves a
                  careful human review.
                </p>
              </div>

              <button
                className="primary-btn"
                onClick={() => {
                  setNotice('');
                  setView('report');
                }}
              >
                <Plus size={17} /> New rescue report
              </button>
            </section>

            {demoMode && (
              <div className="demo-banner">
                <Activity size={18} />

                <div>
                  <strong>You're viewing sample data</strong>
                  <span>
                    Start the backend server to save reports and manage cases
                    persistently.
                  </span>
                </div>
              </div>
            )}

            <section className="stats-grid">
              <Stat
                icon={<ClipboardList size={19} />}
                label="Total reports"
                value={counts.total}
                detail="All recorded cases"
                tone="green"
              />

              <Stat
                icon={<AlertCircle size={19} />}
                label="Needs review"
                value={counts.new}
                detail="Awaiting first review"
                tone="amber"
              />

              <Stat
                icon={<Activity size={19} />}
                label="In progress"
                value={counts.active}
                detail="Reviewing or assigned"
                tone="blue"
              />

              <Stat
                icon={<Check size={19} />}
                label="Resolved"
                value={counts.resolved}
                detail="Marked by volunteers"
                tone="purple"
              />
            </section>

            <section className="cases-panel">
              <div className="panel-heading">
                <div>
                  <h2>Rescue reports</h2>
                  <p>Review details and update each case's status.</p>
                </div>

                <span className="case-count">
                  {filteredReports.length} cases
                </span>
              </div>

              <div className="toolbar">
                <div className="search-box">
                  <Search size={17} />

                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search reports, locations…"
                  />
                </div>

                <div className="filter-wrap">
                  <label htmlFor="status-filter">Status</label>

                  <select
                    id="status-filter"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    {['All', ...statuses].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <ChevronDown size={14} />
                </div>
              </div>

              {loading ? (
                <div className="empty-state">Loading reports…</div>
              ) : filteredReports.length === 0 ? (
                <div className="empty-state">
                  <PawPrint size={26} />
                  <strong>No reports found</strong>
                  <span>
                    Try another search or create a new report.
                  </span>
                </div>
              ) : (
                <div className="report-list">
                  {filteredReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      onStatus={updateStatus}
                    />
                  ))}
                </div>
              )}
            </section>

            <p className="footer-note">
              <ShieldCheck size={15} />
              Demo only: reports do not automatically contact rescuers. A
              volunteer must verify each case.
            </p>
          </>
        ) : (
          <>
            <section className="welcome-row">
              <div>
                <div className="eyebrow">
                  <Mic size={14} /> VOICE-FIRST REPORTING
                </div>

                <h1>Create a rescue report</h1>

                <p className="subheading">
                  Share what you observed. If a detail is uncertain, say so
                  rather than guessing.
                </p>
              </div>
            </section>

            <div className="form-layout">
              <form className="report-form" onSubmit={submitReport}>
                <div className="form-section-title">
                  <span>01</span>

                  <div>
                    <h2>Incident details</h2>
                    <p>Tell us what happened.</p>
                  </div>
                </div>

                <label>
                  Animal type

                  <select
                    value={form.animalType}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        animalType: event.target.value
                      })
                    }
                  >
                    <option>Dog</option>
                    <option>Cat</option>
                    <option>Bird</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Report language

                  <select
                    value={form.language}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        language: event.target.value
                      })
                    }
                  >
                    <option>Marathi</option>
                    <option>Hindi</option>
                    <option>English</option>
                    <option>Hinglish</option>
                  </select>
                </label>

                <label>
                  Location <span className="required">Required</span>

                  <div className="input-with-action">
                    <MapPin size={17} />

                    <input
                      value={form.location}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          location: event.target.value
                        })
                      }
                      placeholder="e.g. near the bus stand, Chandrapur"
                      maxLength={200}
                      required
                    />
                  </div>

                  <small>
                    Do not include a private home address unless it is
                    necessary and you have permission.
                  </small>
                </label>

                <label>
                  What did you observe?{' '}
                  <span className="required">Required</span>

                  <div className="textarea-wrap">
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          description: event.target.value
                        })
                      }
                      placeholder="Describe the animal and what you observed. Avoid guessing its condition…"
                      rows={5}
                      maxLength={1200}
                      required
                    />

                    <button
                      type="button"
                      className="mic-btn"
                      disabled={isTranscribing}
                      onClick={() => startDictation('description')}
                      title={
                        isRecording
                          ? 'Stop recording and transcribe'
                          : 'Record a rescue report using Gnani AI'
                      }
                    >
                      {isRecording ? (
                        <Check size={17} />
                      ) : (
                        <Mic size={17} />
                      )}

                      {isRecording
                        ? 'Stop & transcribe'
                        : isTranscribing
                          ? 'Transcribing…'
                          : 'Record with Gnani'}
                    </button>
                  </div>

                  <small>
                    Record your rescue report in Marathi, Hindi or English.
                    Gnani AI will transcribe it. Please review the transcript
                    before submitting.
                  </small>
                </label>

                {speechMessage && (
                  <div className="speech-message">
                    <Volume2 size={15} />
                    {speechMessage}
                  </div>
                )}

                <div className="consent-note">
                  <ShieldCheck size={18} />

                  <span>
                    Reports are for volunteer review. Please use fictional
                    information in public demos and do not upload private
                    recordings.
                  </span>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setView('home')}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={saving}
                  >
                    {saving ? 'Submitting…' : 'Submit report'}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </form>

              <aside className="form-aside">
                <div className="aside-icon">
                  <PawPrint size={25} />
                </div>

                <h3>A clearer report can help a volunteer act.</h3>

                <p>
                  JeevSetu is designed to organize information—not to diagnose
                  animals or promise a rescue.
                </p>

                <div className="aside-divider" />

                <div className="aside-point">
                  <Check size={16} />
                  <span>Share only what you know</span>
                </div>

                <div className="aside-point">
                  <Check size={16} />
                  <span>Confirm the location</span>
                </div>

                <div className="aside-point">
                  <Check size={16} />
                  <span>Let a volunteer verify the report</span>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ icon, label, value, detail, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}

function ReportCard({ report, onStatus }) {
  const time = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(report.createdAt));

  const animalIcon =
    report.animalType === 'Cat'
      ? '🐈'
      : report.animalType === 'Bird'
        ? '🐦'
        : report.animalType === 'Dog'
          ? '🐕'
          : '🐾';

  return (
    <article className="report-card">
      <div className="animal-avatar">{animalIcon}</div>

      <div className="report-main">
        <div className="report-title-row">
          <strong>{report.animalType} report</strong>

          <span className={`status status-${report.status.toLowerCase()}`}>
            {report.status}
          </span>
        </div>

        <div className="report-location">
          <MapPin size={14} />
          {report.location}
        </div>

        <p>{report.description}</p>

        <div className="report-meta">
          <span>{report.id}</span>
          <span>·</span>
          <span>{report.language}</span>
          <span>·</span>
          <span>{time}</span>

          {report.duplicateOf && (
            <span className="duplicate-tag">Possible duplicate</span>
          )}
        </div>
      </div>

      <div className="report-action">
        <label htmlFor={`status-${report.id}`}>Update status</label>

        <select
          id={`status-${report.id}`}
          value={report.status}
          onChange={(event) => onStatus(report, event.target.value)}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

createRoot(document.getElementById('root')).render(<App />);
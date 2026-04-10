import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_BASE = 'https://checkinapp-wut1.onrender.com/api';
const GOOGLE_API_KEY = 'AIzaSyA2h9iBVXGEOUsl8V6si5BP61f7UrYBs8s';

const OFFICE_LOCATIONS = [
  { name: 'Innowell Chennai', lat: 13.0536522, lng: 80.1660282 },
  { name: 'Innowell Rajapalayam', lat: 9.432248, lng: 77.7471651 }
];

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

function EmployeeApp() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [todayRecord, setTodayRecord] = useState(null);
  const [location, setLocation] = useState(null); // { lat, lng, address }
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [map, setMap] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const markerRef = useRef(null);
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (token && user?.role === 'admin') {
      window.location.href = '/admin';
    }
  }, [token, user]);

  const normalizeTodayRecord = (payload) => {
    if (payload && typeof payload === 'object' && 'record' in payload) {
      return payload.record ?? null;
    }
    return payload ?? null;
  };

  const loadTodayRecord = async (authToken) => {
    if (!authToken) {
      setTodayRecord(null);
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/attendance/today`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setTodayRecord(normalizeTodayRecord(res.data));
    } catch {
      setTodayRecord(null);
    }
  };



  useEffect(() => {
    let mapInstance = null;

    if (token && mapContainerRef.current) {
      mapInstance = L.map(mapContainerRef.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        attributionControl: false
      }).setView([13.0536522, 80.1660282], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);

      OFFICE_LOCATIONS.forEach(loc => {
        L.circleMarker([loc.lat, loc.lng], {
          radius: 6,
          fillColor: '#185FA5',
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 1
        }).addTo(mapInstance).bindPopup(loc.name);
      });

      setMap(mapInstance);

      // Fetch real GPS location on mount
      setGpsLoading(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            mapInstance.setView([latitude, longitude], 17);
            handleLocationSelect(latitude, longitude, mapInstance);
            setGpsLoading(false);
          },
          (err) => {
            console.error('GPS Error:', err);
            setErrorMessage('Location access denied. Please enable GPS.');
            setStatus('error');
            setGpsLoading(false);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        setErrorMessage('Geolocation is not supported by your browser.');
        setStatus('error');
        setGpsLoading(false);
      }
    }

    return () => {
      if (mapInstance) {
        mapInstance.remove();
        setMap(null);
      }
    };
  }, [token]);

  useEffect(() => {
    loadTodayRecord(token);
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
      const { access_token } = res.data;

      const meRes = await axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(meRes.data));

      if (meRes.data?.role === 'admin') {
        window.location.href = '/admin';
        return;
      }

      setToken(access_token);
      setUser(meRes.data);
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/employee';
  };

  const resolveAddress = async (lat, lng) => {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`;
      const gRes = await fetch(gUrl);
      const gData = await gRes.json();

      if (gData.status === 'OK') {
        return gData.results[0].formatted_address;
      }
    } catch (err) {
      // Fall back to OSM reverse geocoder.
    }

    try {
      const nUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const nRes = await fetch(nUrl);
      const nData = await nRes.json();
      return nData.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (err) {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  };

  const handleLocationSelect = async (lat, lng, currentMap) => {
    setStatus('loading');
    setErrorMessage('');

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: false }).addTo(currentMap);
    }

    try {
      const resolvedAddress = await resolveAddress(lat, lng);
      setLocation({ lat, lng, address: resolvedAddress });
      setStatus('ok');
    } catch (err) {
      setLocation({ lat, lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
      setStatus('error');
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation not supported');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (map) {
          map.setView([latitude, longitude], 17);
          handleLocationSelect(latitude, longitude, map);
        }
        setGpsLoading(false);
      },
      () => {
        setErrorMessage('Location access denied. Please enable GPS.');
        setStatus('error');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleCheckIn = async () => {
    if (todayRecord) {
      setErrorMessage('You are already checked in. Please check out first.');
      return;
    }

    if (!location) {
      setErrorMessage('Set your location before checking in');
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/attendance/checkin`, {
        lat: location.lat,
        lng: location.lng,
        address: location.address
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const nextRecord = normalizeTodayRecord(res.data);
      setTodayRecord((prev) => ({ ...(prev || {}), ...(nextRecord || {}) }));
      await loadTodayRecord(token);
      setErrorMessage('');
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Check in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!location) {
      setErrorMessage('Set your location before checking in');
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/attendance/checkout`, {
        lat: location.lat,
        lng: location.lng,
        address: location.address
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const nextRecord = normalizeTodayRecord(res.data);
      setTodayRecord((prev) => ({ ...(prev || {}), ...(nextRecord || {}) }));
      await loadTodayRecord(token);
      setErrorMessage('');
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Check out failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!location) {
      setErrorMessage('Set your location before checking in');
      return;
    }

    if (todayRecord && !todayRecord.check_out_time) {
      handleCheckOut();
      return;
    }

    handleCheckIn();
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  };

  const getStatusColor = () => {
    if (status === 'loading') return '#EF9F27';
    if (status === 'ok') return '#1D9E75';
    if (status === 'error') return '#E24B4A';
    return '#999999';
  };

  const isAllDone = Boolean(todayRecord && todayRecord.check_out_time);
  const buttonText = todayRecord && !todayRecord.check_out_time ? 'Check Out' : 'Check In';

  if (!token) {
    return (
      <div style={styles.loginPage}>
        <style dangerouslySetInnerHTML={{ __html: styles.global }} />
        <div style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Innowell Attendance</h1>
          <p style={styles.loginSubtitle}>Sign in to check in or out</p>
          <form style={styles.loginForm} onSubmit={handleLogin}>
            <input 
              type="email" placeholder="Email" style={styles.loginInput} 
              value={email} onChange={e => setEmail(e.target.value)} required 
            />
            <input 
              type="password" placeholder="Password" style={styles.loginInput} 
              value={password} onChange={e => setPassword(e.target.value)} required 
            />
            {loginError && <p style={styles.errorText}>{loginError}</p>}
            <button type="submit" style={styles.mainButton} disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appWrapper}>
      <style dangerouslySetInnerHTML={{ __html: styles.global }} />
      <div style={styles.card}>
        <header style={styles.header}>
          <div style={styles.headerInfo}>
            <div style={styles.userName}>{user?.name}</div>
            <div style={styles.userDept}>{user?.department}</div>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </header>

        <main style={styles.main}>
          <div style={styles.mapContainer}>
            {gpsLoading && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '500', color: '#185FA5'
              }}>
                Fetching your location...
              </div>
            )}
            <div style={styles.mapHint}>GPS Tracking Active</div>
            <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }}></div>
          </div>

          <button onClick={detectLocation} style={styles.secondaryButton}>
            Refresh My Location
          </button>

          <div style={styles.statusStrip}>
            <div style={{ ...styles.statusDot, backgroundColor: getStatusColor() }} className={status === 'loading' ? 'pulse' : ''} />
            <div style={{ flex: 1 }}>
              {location ? (
                <>
                  <div style={styles.coords}>{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</div>
                  <div style={styles.addressText}>{location.address}</div>
                </>
              ) : (
                <div style={styles.noLocationText}>No location set</div>
              )}
            </div>
          </div>

          <div style={styles.actionArea}>
            {!todayRecord && (
              <button onClick={handleCheckIn} style={{
                width:'100%', padding:'11px', borderRadius:'8px',
                border:'0.5px solid rgba(0,0,0,0.2)', background:'#fff',
                color:'#1a1a1a', fontSize:'15px', fontWeight:'500',
                cursor:'pointer', marginTop:'1rem'
              }}>
                Check In
              </button>
            )}

            {todayRecord && !todayRecord.check_out_time && (
              <div>
                <p style={{fontSize:'12px', color:'#666', marginTop:'1rem', textAlign:'center'}}>
                  Checked in at {new Date(todayRecord.check_in_time).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
                  })}
                </p>
                <button onClick={handleCheckOut} style={{
                  width:'100%', padding:'11px', borderRadius:'8px',
                  border:'0.5px solid rgba(24,95,165,0.25)', background:'#EAF2FB',
                  fontSize:'15px', fontWeight:'500', color:'#185FA5',
                  cursor:'pointer', marginTop:'8px'
                }}>
                  Check Out
                </button>
              </div>
            )}

            {todayRecord && todayRecord.check_out_time && (
              <div style={{
                marginTop:'1rem', padding:'11px', borderRadius:'8px',
                background:'#EAF3DE', border:'0.5px solid #97C459',
                textAlign:'center'
              }}>
                <p style={{fontWeight:'600', color:'#3B6D11'}}>✓ All done for today</p>
                <p style={{fontSize:'12px', color:'#666', marginTop:'4px'}}>
                  In: {new Date(todayRecord.check_in_time).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
                  })}
                  &nbsp;→&nbsp;
                  Out: {new Date(todayRecord.check_out_time).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
                  })}
                </p>
              </div>
            )}
            {errorMessage && <p style={styles.errorText}>{errorMessage}</p>}
          </div>
        </main>
      </div>

      <div style={{maxWidth:'480px', margin:'0 auto', padding:'0 1rem'}}>
        <p style={{
          fontSize:'11px', fontWeight:'500', color:'#888',
          textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px'
        }}>Today's Check-ins</p>

        {todayRecord ? (
          <div style={{
            background:'#fff', borderRadius:'12px',
            border:'0.5px solid rgba(0,0,0,0.08)', padding:'12px 16px',
            display:'flex', alignItems:'flex-start', gap:'12px'
          }}>
            <div style={{
              width:'32px', height:'32px', borderRadius:'50%',
              background:'#E6F1FB', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:'12px', fontWeight:'600',
              color:'#185FA5', flexShrink:0
            }}>
              {(JSON.parse(localStorage.getItem('user'))?.name || 'U')
                .split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <p style={{fontSize:'14px', fontWeight:'500'}}>
                {JSON.parse(localStorage.getItem('user'))?.name}
              </p>
              <p style={{fontSize:'12px', color:'#888', marginTop:'2px'}}>
                {JSON.parse(localStorage.getItem('user'))?.department}
              </p>
              {todayRecord.check_in_address && (
                <p style={{fontSize:'12px', color:'#555', marginTop:'4px', lineHeight:'1.5'}}>
                  📍 {todayRecord.check_in_address}
                </p>
              )}
            </div>
            <p style={{fontSize:'12px', color:'#aaa', fontFamily:'monospace', paddingTop:'2px', whiteSpace:'nowrap'}}>
              {new Date(todayRecord.check_in_time).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
              })}
            </p>
          </div>
        ) : (
          <p style={{fontSize:'13px', color:'#aaa', padding:'10px 0'}}>No check-ins yet.</p>
        )}
      </div>

    </div>
  );
}

const styles = {
  global: `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    body { 
      margin: 0; 
      background-color: #f4f4f0; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .pulse { animation: pulse-animation 2s infinite; }
    @keyframes pulse-animation { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 159, 39, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 159, 39, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 159, 39, 0); } }
  `,
  loginPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f0', padding: '1rem' },
  loginCard: { 
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '0.5px solid rgba(0,0,0,0.12)',
    padding: '1.5rem'
  },
  loginTitle: { fontSize: '22px', fontWeight: '600', margin: '0 0 4px 0', color: '#1a1a1a' },
  loginSubtitle: { fontSize: '13px', color: '#666666', margin: '0 0 1.5rem 0' },
  loginForm: { display: 'flex', flexDirection: 'column', gap: '12px' },
  loginInput: { 
    width: '100%',
    height: '38px',
    padding: '0 10px',
    border: '0.5px solid rgba(0,0,0,0.2)',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none'
  },

  appWrapper: {
    minHeight: '100vh',
    backgroundColor: '#f4f4f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '2rem 1rem',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '0.5px solid rgba(0,0,0,0.12)',
    padding: '1.5rem'
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' },
  headerInfo: { flex: 1 },
  userName: { fontSize: '18px', fontWeight: '700', color: '#1a1a1a' },
  userDept: { fontSize: '12px', color: '#666666', marginTop: '2px' },
  logoutBtn: { 
    fontSize: '12px',
    color: '#185FA5',
    backgroundColor: '#EAF2FB',
    border: '0.5px solid rgba(24,95,165,0.25)',
    borderRadius: '20px',
    padding: '6px 14px',
    cursor: 'pointer'
  },

  main: { display: 'flex', flexDirection: 'column' },
  mapContainer: { 
    position: 'relative',
    height: '220px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '0.5px solid rgba(0,0,0,0.15)'
  },
  mapHint: { 
    position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)',
    backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: '20px', 
    padding: '4px 12px', fontSize: '12px', color: '#555', zIndex: 500,
    pointerEvents: 'none', whiteSpace: 'nowrap'
  },
  secondaryButton: {
    alignSelf: 'flex-start', fontSize: '12px', fontWeight: '500', color: '#185FA5',
    backgroundColor: '#EAF2FB', border: '0.5px solid rgba(24,95,165,0.25)',
    borderRadius: '20px', padding: '5px 12px', marginTop: '8px', cursor: 'pointer'
  },

  statusStrip: {
    backgroundColor: '#f4f4f0',
    border: '0.5px solid rgba(0,0,0,0.12)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginTop: '8px',
    display: 'flex', alignItems: 'flex-start', gap: '10px'
  },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', marginTop: '4px', flexShrink: 0 },
  coords: { fontSize: '12px', color: '#3b3b3b', fontFamily: 'monospace' },
  addressText: { fontSize: '12px', color: '#666666', marginTop: '2px', lineHeight: 1.4 },
  noLocationText: { fontSize: '12px', color: '#666666' },

  actionArea: { marginTop: '1rem' },
  buttonWrapper: { width: '100%' },
  mainButton: {
    width: '100%',
    padding: '11px',
    borderRadius: '8px',
    border: '0.5px solid rgba(24,95,165,0.25)',
    backgroundColor: '#185FA5',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  checkoutButton: {
    backgroundColor: '#EAF2FB',
    color: '#185FA5',
    borderColor: 'rgba(24,95,165,0.25)'
  },
  disabledButton: {
    opacity: 0.6,
    cursor: 'not-allowed',
    pointerEvents: 'none'
  },
  errorText: {
    color: '#E24B4A',
    fontSize: '12px',
    marginTop: '8px',
    textAlign: 'left'
  },

  doneBanner: {
    backgroundColor: '#EAF3DE',
    color: '#2D7B2E',
    borderRadius: '8px',
    border: '0.5px solid #97C459',
    padding: '12px'
  },
  doneTimes: {
    fontSize: '12px',
    color: '#2D7B2E',
    marginTop: '4px'
  }
};

export default EmployeeApp;

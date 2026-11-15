import {useCallback, useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {Lottie} from 'lottie-react';
import NumberFlow from '@number-flow/react';
import {api, DEMO, enEspanol, sb} from './datos.js';
import check from './check.json';
import BlurText from './bits/BlurText.jsx'; // React Bits (MIT + Commons Clause)

const PRESION = {whileTap: {scale: 0.97}};
const cascada = {visible: {transition: {staggerChildren: 0.055}}};
const sube = {oculto: {opacity: 0, y: 14}, visible: {opacity: 1, y: 0}};

const Icono = ({d, ...p}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);
const I = {
  videos: ['M4 6h16v12H4z', 'M10 9.5v5l4.5-2.5z'],
  pedidos: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 15v4h14v-4'],
  rend: ['M5 19V10', 'M12 19V5', 'M19 19v-6'],
  sol: ['M12 4V2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'M6.3 6.3 4.9 4.9', 'M19.1 19.1l-1.4-1.4', 'M6.3 17.7l-1.4 1.4', 'M19.1 4.9l-1.4 1.4', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  luna: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
};

function Fondo() {
  // Patrón original: claqueta, nota y botón de reproducir, muy tenue.
  return (
    <div className="fondo" aria-hidden="true">
      <svg>
        <defs>
          <pattern id="p" width="168" height="168" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 34h44v30H18z M18 34l6-10 44 6-6 4 M30 25l6 8 M44 27l6 8" />
              <path d="M112 30v30 M112 30l18-5v28 M106 62a6 5 0 1 0 6-2 M124 56a6 5 0 1 0 6-2" />
              <path d="M40 112a16 16 0 1 0 .1 0z M36 121v14l12-7z" />
              <path d="M104 118h34v22h-34z M112 118v22 M130 118v22 M104 129h8 M130 129h8" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#p)" />
      </svg>
    </div>
  );
}

function Titulo({ligera, fuerte}) {
  // Entrada palabra por palabra (BlurText de React Bits).
  return (
    <div className="titulo" role="heading" aria-level="1" aria-label={`${ligera} ${fuerte}`}>
      <BlurText key={ligera} text={ligera} className="ligera" delay={60} distance={12} blur={6} stepDuration={0.28} trigger="load" />
      <BlurText key={fuerte} text={fuerte} className="fuerte" delay={60} distance={12} blur={6} stepDuration={0.28} trigger="load" />
    </div>
  );
}

// Tira de mini pantallas que se desliza sola en la entrada (estilo Marquee de Magic UI).
function Tira() {
  const fichas = ['475M', '4 días', '$79.99', '1,080', '19 nov', '13 años'];
  return (
    <div className="tira" aria-hidden="true">
      <div className="tira-pista">
        {[...fichas, ...fichas].map((t, i) => (
          <span key={i} className={`mini${i % 3 === 1 ? ' senal' : i % 3 === 2 ? ' clara' : ''}`}><b>{t}</b><i /><i /></span>
        ))}
      </div>
    </div>
  );
}

function Selector({opciones, valor, onCambio, id}) {
  return (
    <div className="selector" role="group">
      {opciones.map(([k, n]) => (
        <button key={k} aria-pressed={valor === k} onClick={() => onCambio(k)}>
          {valor === k && <motion.span layoutId={`gota-${id}`} className="gota" />}
          {n}
        </button>
      ))}
    </div>
  );
}

function Vacio({children}) {
  return (
    <div className="vacio">
      <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 30h52v34H14z M14 30l7-13 50 8-6 5 M29 20l7 10 M46 23l7 9" />
        <path d="M34 41v13l11-6.5z" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

function Video({v, avisar, recargar}) {
  const [url, setUrl] = useState(null);
  const [verTexto, setVerTexto] = useState(false);
  const [recien, setRecien] = useState(false);
  const texto = [v.title, '', v.description, '', (v.hashtags || []).join(' ')].join('\n');
  const publicado = v.status === 'publicado';

  const ver = async () => {
    const u = await api.urlVideo(v.storage_path);
    u ? setUrl(u) : avisar(DEMO ? 'En la muestra no hay video real.' : 'Ese video ya no está: se borran a los 7 días.');
  };
  const descargar = async () => {
    const u = await api.urlVideo(v.storage_path, true);
    u ? (location.href = u) : avisar(DEMO ? 'En la muestra no hay video real.' : 'Ese video ya no está.');
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); avisar('Texto copiado'); } catch { setVerTexto(true); avisar('Mantén presionado el texto para copiarlo.'); }
  };
  const alternar = async () => {
    await api.estado(v.id, publicado ? 'listo' : 'publicado');
    if (!publicado) setRecien(true);
    v.status = publicado ? 'listo' : 'publicado';
    recargar();
  };

  return (
    <motion.article layout variants={sube} className={`video${url ? ' abierto' : ''}`}>
      {url ? (
        <video src={url} controls playsInline autoPlay />
      ) : (
        <motion.button {...PRESION} className="poster" onClick={ver} aria-label={`Ver ${v.title}`}>
          <span className="rayas" />
          <span className="play" />
          <small>{v.lang === 'es' ? 'Español' : 'Inglés'}</small>
        </motion.button>
      )}
      <div className="info">
        <div className="cuenta">
          {v.account || v.brand}
          <span className={`sello ${publicado ? 'listo' : 'pendiente'}`}>{publicado ? 'Publicado' : 'Por subir'}</span>
        </div>
        <h3>{v.title || v.spec_id}</h3>
        {v.notes && <p className="nota">{v.notes}</p>}
        <AnimatePresence initial={false}>
          {verTexto && (
            <motion.pre className="texto" initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} exit={{height: 0, opacity: 0}}>
              {texto}
            </motion.pre>
          )}
        </AnimatePresence>
        <div className="acciones">
          <motion.button {...PRESION} className="pildora llena" onClick={descargar}>Descargar</motion.button>
          <motion.button {...PRESION} className="pildora" onClick={copiar}>Copiar texto</motion.button>
          <motion.button {...PRESION} className={`pildora${publicado ? ' hecho' : ''}`} onClick={alternar}>
            {publicado && (recien
              ? <Lottie className="lottie" src={check} loop={false} autoplay />
              : <Icono d={['M5 12.5l4.5 4.5L19 7.5']} style={{width: 20, height: 20}} />)}
            {publicado ? 'Publicado' : 'Marcar publicado'}
          </motion.button>
        </div>
        <button className="enlace" style={{alignSelf: 'flex-start', marginTop: 6}} onClick={() => setVerTexto((x) => !x)}>
          {verTexto ? 'Ocultar texto' : 'Ver título y hashtags'}
        </button>
      </div>
    </motion.article>
  );
}

function Videos({dueno, avisar}) {
  const [lista, setLista] = useState(null);
  const [, pinta] = useState(0);
  useEffect(() => { setLista(null); api.videos(dueno).then(setLista).catch((e) => avisar(e.message)); }, [dueno]);
  if (!lista) return null;
  if (!lista.length) return <Vacio>Todavía no hay videos aquí. Aparecen solos cada mañana, cuando termina el render.</Vacio>;
  const dias = [...new Set(lista.map((v) => v.day))];
  const hoy = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Panama'}).format(new Date());
  const nombre = (d) => (d === hoy ? 'Hoy' : new Date(`${d}T12:00:00`).toLocaleDateString('es', {weekday: 'long', day: 'numeric', month: 'long'}));
  return (
    <motion.div variants={cascada} initial="oculto" animate="visible">
      {dias.map((d) => (
        <section key={d}>
          <motion.div variants={sube} className="dia">{nombre(d)}</motion.div>
          {lista.filter((v) => v.day === d).map((v) => <Video key={v.id} v={v} avisar={avisar} recargar={() => pinta((n) => n + 1)} />)}
        </section>
      ))}
    </motion.div>
  );
}

function Pedido({r, avisar, recargar}) {
  const [archivos, setArchivos] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const listar = useCallback(() => api.archivos(r.folder).then(setArchivos), [r.folder]);
  useEffect(() => { listar(); }, [listar]);
  const listo = r.status === 'listo';

  const subir = async (e) => {
    const elegidos = [...e.target.files];
    if (!elegidos.length) return;
    setSubiendo(true);
    let bien = 0;
    for (const f of elegidos) {
      if (f.size > 50 * 1024 * 1024) { avisar(`${f.name} pesa más de 50 MB.`); continue; }
      const error = await api.subir(r.folder, f);
      error ? avisar(`${f.name}: ${error}`) : bien++;
    }
    if (bien) avisar(bien === 1 ? '1 archivo subido' : `${bien} archivos subidos`);
    e.target.value = '';
    setSubiendo(false);
    listar();
  };

  return (
    <motion.article variants={sube} className="tarjeta">
      <span className={`sello ${listo ? 'listo' : 'pendiente'}`}>{listo ? 'Listo' : 'Falta'}</span>
      <h3>{r.title}</h3>
      <p>{r.detail}</p>
      <label className="soltar">
        <input type="file" multiple accept={r.kind === 'musica' ? 'audio/*' : 'video/*,image/*'} onChange={subir} disabled={subiendo} />
        {subiendo ? 'Subiendo…' : <><b>Elegir archivos</b> para subirlos</>}
      </label>
      <motion.button {...PRESION} className={`pildora${listo ? '' : ' llena'}`} onClick={async () => { await api.estadoPedido(r.id, listo ? 'pendiente' : 'listo'); recargar(); }}>
        {listo ? 'Volver a abrir' : 'Ya subí todo'}
      </motion.button>
      {archivos && <div className="archivos">{archivos.length ? `Subidos: ${archivos.join(', ')}` : 'Aún no hay archivos subidos.'}</div>}
    </motion.article>
  );
}

function Buzon({dueno, avisar}) {
  const quien = dueno === 'todos' ? 'juan' : dueno;
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => api.buzon(dueno).then(setLista).catch(() => setLista([])), [dueno]);
  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return avisar('Escribe o pega algo primero.');
    setOcupado(true);
    const error = await api.enviarNota(quien, texto.trim());
    setOcupado(false);
    if (error) return avisar(error);
    setTexto('');
    avisar('Enviado. Claude lo lee en la sesión de la noche.');
    cargar();
  };
  const subir = async (e) => {
    const elegidos = [...e.target.files];
    if (!elegidos.length) return;
    setOcupado(true);
    let bien = 0;
    for (const f of elegidos) {
      if (f.size > 50 * 1024 * 1024) { avisar(`${f.name} pesa más de 50 MB.`); continue; }
      const error = await api.subir('buzon', new File([f], `${quien}-${f.name}`, {type: f.type}));
      error ? avisar(`${f.name}: ${error}`) : bien++;
    }
    if (bien) avisar(bien === 1 ? '1 archivo enviado' : `${bien} archivos enviados`);
    e.target.value = '';
    setOcupado(false);
    cargar();
  };

  return (
    <motion.article variants={sube} className="tarjeta">
      <h3>Buzón para Claude</h3>
      <p>Pega aquí links de streams o videos, ideas, o lo que Claude te haya pedido. También puedes mandar archivos.</p>
      <form onSubmit={enviar}>
        <textarea className="nota" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. https://www.twitch.tv/videos/… campaña de Whop, paga $1 por mil vistas" />
        <motion.button {...PRESION} className="pildora llena" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar'}</motion.button>
      </form>
      <label className="soltar buzon-archivo">
        <input type="file" multiple onChange={subir} disabled={ocupado} />
        <b>Elegir archivos</b> para mandarlos
      </label>
      {lista.length > 0 && (
        <ul className="enviados">
          {lista.map((x) => <li key={x.nombre}>{dueno === 'todos' && <b>{x.de}: </b>}{x.texto ?? x.nombre.replace(/^[a-z]+-/, '')}</li>)}
        </ul>
      )}
    </motion.article>
  );
}

function Pedidos({dueno, avisar}) {
  const [lista, setLista] = useState(null);
  const cargar = useCallback(() => api.pedidos(dueno).then(setLista).catch((e) => avisar(e.message)), [dueno]);
  useEffect(() => { setLista(null); cargar(); }, [cargar]);
  if (!lista) return null;
  return (
    <motion.div variants={cascada} initial="oculto" animate="visible">
      <Buzon dueno={dueno} avisar={avisar} />
      {!lista.length && <p className="apoyo">Claude no te ha pedido nada por ahora.</p>}
      {lista.map((r) => <Pedido key={r.id} r={r} avisar={avisar} recargar={cargar} />)}
    </motion.div>
  );
}

const REDES = [['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['youtube', 'YouTube']];

function Rendimiento({dueno, avisar}) {
  const [datos, setDatos] = useState(null);
  const cargar = useCallback(async () => {
    const [videos, metricas] = await Promise.all([api.videos(dueno), api.metricas()]);
    setDatos({videos: videos.filter((v) => v.status === 'publicado'), metricas});
  }, [dueno]);
  useEffect(() => { setDatos(null); cargar().catch((e) => avisar(e.message)); }, [cargar]);
  if (!datos) return null;
  if (!datos.videos.length) return <Vacio>Marca un video como publicado y aquí podrás anotar cuántas vistas lleva en cada red.</Vacio>;
  const ultima = (id, red) => datos.metricas.find((m) => m.video_id === id && m.platform === red)?.views;
  const total = datos.videos.reduce((a, v) => a + REDES.reduce((b, [k]) => b + (ultima(v.id, k) || 0), 0), 0);

  const guardar = async (e, v) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const filas = REDES.map(([k]) => [k, f.get(k)]).filter(([, n]) => n !== '').map(([k, n]) => ({video_id: v.id, platform: k, views: Number(n)}));
    if (!filas.length) return avisar('Escribe al menos un número.');
    const error = await api.guardarVistas(filas);
    avisar(error || 'Vistas guardadas');
    if (!error) cargar();
  };

  const porRed = REDES.map(([k, n]) => ({k, n, vistas: datos.videos.reduce((a, v) => a + (ultima(v.id, k) || 0), 0)}));
  const tope = Math.max(1, ...porRed.map((r) => r.vistas));
  const porVideo = datos.videos.map((v) => ({v, vistas: REDES.reduce((a, [k]) => a + (ultima(v.id, k) || 0), 0)})).sort((x, y) => y.vistas - x.vistas);
  const mejor = porVideo[0];
  const num = (n) => n.toLocaleString('es');

  return (
    <motion.div variants={cascada} initial="oculto" animate="visible">
      <div className="bento">
        <motion.section variants={sube} className="ficha total">
          <div className="cifra"><NumberFlow value={total} locales="es" /></div>
          <span>vistas en total, sumando las tres redes</span>
        </motion.section>
        <motion.section variants={sube} className="ficha ancha">
          <h3>Vistas por red</h3>
          <div className="barras" role="list">
            {porRed.map((r) => (
              <div key={r.k} role="listitem" className="barra-fila" title={`${r.n}: ${num(r.vistas)} vistas (${total ? Math.round((r.vistas / total) * 100) : 0}% del total)`}>
                <span className="barra-nombre">{r.n}</span>
                <span className="barra-pista">
                  <motion.span className="barra-marca" initial={{width: 0}} animate={{width: `${(r.vistas / tope) * 100}%`}} transition={{type: 'spring', damping: 24, stiffness: 120}} />
                </span>
                <span className="barra-valor">{num(r.vistas)}</span>
              </div>
            ))}
          </div>
        </motion.section>
        <motion.section variants={sube} className="ficha">
          <h3>El que más pegó</h3>
          <p className="mejor">{mejor.vistas ? mejor.v.title : 'Aún sin vistas anotadas'}</p>
          {mejor.vistas > 0 && <span className="apoyo">{num(mejor.vistas)} vistas</span>}
        </motion.section>
        <motion.section variants={sube} className="ficha">
          <h3>Publicados</h3>
          <div className="cifra chica"><NumberFlow value={datos.videos.length} /></div>
          <span className="apoyo">{datos.videos.length === 1 ? 'video' : 'videos'}</span>
        </motion.section>
      </div>
      <motion.div variants={sube} className="dia">Anota las vistas de hoy</motion.div>
      {datos.videos.map((v) => (
        <motion.form key={v.id} variants={sube} className="tarjeta" onSubmit={(e) => guardar(e, v)}>
          <span className="sello">{v.account}</span>
          <h3>{v.title}</h3>
          <div className="redes">
            {REDES.map(([k, n]) => (
              <label key={k}>{n}<input name={k} type="number" min="0" inputMode="numeric" defaultValue={ultima(v.id, k) ?? ''} placeholder="0" /></label>
            ))}
          </div>
          <motion.button {...PRESION} className="pildora llena">Guardar vistas</motion.button>
        </motion.form>
      ))}
    </motion.div>
  );
}

function Entrada({avisar, alEntrar}) {
  const [modo, setModo] = useState('entrar');
  const [ocupado, setOcupado] = useState(false);
  const crear = modo === 'crear';
  const enviar = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const cred = {email: String(f.get('correo')).trim(), password: String(f.get('clave'))};
    if (!cred.email || cred.password.length < 8) return avisar('Escribe tu correo y una contraseña de 8 caracteres o más.');
    setOcupado(true);
    const {error} = crear ? await sb.auth.signUp(cred) : await sb.auth.signInWithPassword(cred);
    setOcupado(false);
    if (error) return avisar(enEspanol(error.message));
    if (crear) { avisar('Cuenta creada. Avísale a Claude para que la active.'); setModo('entrar'); } else alEntrar();
  };
  return (
    <div className="entrada">
      <Titulo ligera={crear ? 'Primera vez,' : 'Qué bueno verte,'} fuerte={crear ? 'crea tu cuenta' : 'entra a tus clips'} />
      <Selector id="entrada" valor={modo} onCambio={setModo} opciones={[['entrar', 'Ya tengo cuenta'], ['crear', 'Primera vez']]} />
      <form onSubmit={enviar} style={{marginTop: 14}}>
        <input className="campo" name="correo" type="email" placeholder="Correo" autoComplete="email" />
        <input className="campo" name="clave" type="password" placeholder="Contraseña" autoComplete={crear ? 'new-password' : 'current-password'} />
        <motion.button {...PRESION} className="pildora llena" disabled={ocupado}>{crear ? 'Crear cuenta' : 'Entrar'}</motion.button>
      </form>
      <p>{crear ? 'La contraseña lleva 8 caracteres o más. Después de crearla, Claude la activa desde el proyecto.' : 'Si nunca has entrado, toca "Primera vez".'}</p>
      <Tira />
    </div>
  );
}

const PESTANAS = [
  ['videos', 'Videos', 'Tus videos,', 'listos para subir'],
  ['pedidos', 'Pedidos', 'Lo que falta,', 'para los próximos'],
  ['rend', 'Vistas', 'Así va,', 'cada video'],
];
const DUENOS = [['juan', 'Juan'], ['socio', 'Socio'], ['todos', 'Los dos']];

export default function App() {
  const [estado, setEstado] = useState({cargando: true});
  const [pestana, setPestana] = useState(() => (DEMO && new URLSearchParams(location.search).get('tab')) || 'videos');
  const [dueno, setDueno] = useState('juan');
  const [aviso, setAviso] = useState(null);
  const [tema, setTema] = useState(() => document.documentElement.dataset.tema || (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'));

  const avisar = useCallback((t) => { setAviso({t, k: Date.now()}); }, []);
  useEffect(() => { if (!aviso) return; const id = setTimeout(() => setAviso(null), 3200); return () => clearTimeout(id); }, [aviso]);
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'oscuro' ? '#171b24' : '#F6F4EE');
    try { localStorage.setItem('clips-tema', tema); } catch {}
  }, [tema]);

  const arrancar = useCallback(async () => {
    const s = await api.sesion();
    setEstado(s);
    if (s.miembro?.role === 'socio') setDueno('socio');
  }, []);
  useEffect(() => { arrancar(); }, [arrancar]);

  const actual = PESTANAS.find((p) => p[0] === pestana);
  const dentro = Boolean(estado.miembro);

  return (
    <>
      <Fondo />
      <div className="app">
        <header className="barra">
          <div className="marca"><i />clips</div>
          {(estado.session || DEMO) && <button className="salir" onClick={async () => { await sb.auth.signOut(); setEstado({}); }}>Salir</button>}
          <motion.button {...PRESION} className="redondo" onClick={() => setTema(tema === 'oscuro' ? 'claro' : 'oscuro')} aria-label={tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
            <Icono d={tema === 'oscuro' ? I.sol : I.luna} />
          </motion.button>
        </header>

        {estado.cargando ? null : !estado.session && !DEMO ? (
          <Entrada avisar={avisar} alEntrar={arrancar} />
        ) : !dentro ? (
          <>
            <Titulo ligera="Ya casi," fuerte="falta activar tu cuenta" />
            <div className="tarjeta"><p style={{margin: 0}}>Tu cuenta existe, pero todavía no tiene acceso. Dile a Claude en el proyecto que ya la creaste y te la activa.</p></div>
          </>
        ) : (
          <>
            <Titulo ligera={actual[2]} fuerte={actual[3]} />
            <Selector id="dueno" valor={dueno} onCambio={setDueno} opciones={DUENOS} />
            <AnimatePresence mode="wait">
              <motion.main key={pestana + dueno} initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: 0.12}}>
                {pestana === 'videos' && <Videos dueno={dueno} avisar={avisar} />}
                {pestana === 'pedidos' && <Pedidos dueno={dueno} avisar={avisar} />}
                {pestana === 'rend' && <Rendimiento dueno={dueno} avisar={avisar} />}
              </motion.main>
            </AnimatePresence>
          </>
        )}
      </div>

      {dentro && (
        <nav className="menu" aria-label="Secciones">
          {PESTANAS.map(([k, n]) => (
            <motion.button key={k} {...PRESION} aria-current={pestana === k ? 'page' : undefined} onClick={() => setPestana(k)}>
              {pestana === k && <motion.span layoutId="gota-menu" className="gota" />}
              <Icono d={I[k]} />
              <span>{n}</span>
            </motion.button>
          ))}
        </nav>
      )}

      <AnimatePresence>
        {aviso && (
          <motion.div key={aviso.k} className="aviso" role="status" initial={{opacity: 0, y: 16, x: '-50%'}} animate={{opacity: 1, y: 0, x: '-50%'}} exit={{opacity: 0, y: 10, x: '-50%'}}>
            {aviso.t}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

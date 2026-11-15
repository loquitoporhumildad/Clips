import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import Lenis from 'lenis';
import App from './App.jsx';
import './styles.css';

// Desplazamiento suave (Lenis), salvo que la persona pida menos movimiento.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) new Lenis({autoRaf: true, lerp: 0.12});

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user" transition={{type: 'spring', damping: 18, stiffness: 220, mass: 0.9}}>
    <App />
  </MotionConfig>,
);

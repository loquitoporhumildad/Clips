import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user" transition={{type: 'spring', damping: 18, stiffness: 220, mass: 0.9}}>
    <App />
  </MotionConfig>,
);

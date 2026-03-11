import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { FeaturePreview } from './FeaturePreview.tsx';

const params = new URLSearchParams(window.location.search);
const featureParam = params.get('feature');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {featureParam ? <FeaturePreview initialFeature={featureParam} /> : <App />}
  </StrictMode>
);

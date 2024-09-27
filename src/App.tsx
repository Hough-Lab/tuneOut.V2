// import  Shazam  from 'node-shazam';
import { useState } from 'react';

import logo from './logo.svg';

import './App.css';

import { captureTab } from './background';

function App() {
  const [count, setCount] = useState(0);

  const handleCaptureTab = async () => {
    const tabId = 0;
    try {
      const data = await captureTab(tabId);
      console.log(data);
      // const recognise = await Shazam.recognise(data); // Assuming Shazam can accept a Buffer
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="App" style={{ width: '200px' }}>
      <header className="App-header">
        <button onClick={handleCaptureTab}>Capture Tab</button>
        <img src={logo} className="App-logo" alt="logo" />
        <p>Hello Vite + React!</p>
        <p>
          <button type="button" onClick={() => setCount((count) => count + 1)}>
            count is: {count}
          </button>
        </p>
        <p>
          Edit <code>App.tsx</code> and save to test HMR updates.
        </p>
        <p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
          {' | '}
          <a
            className="App-link"
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vite Docs
          </a>
        </p>
      </header>
    </div>
  );
}

export default App;

/**
 * for static assets:
 * import logo from './logo.png'
const url = chrome.runtime.getURL(logo)
 */

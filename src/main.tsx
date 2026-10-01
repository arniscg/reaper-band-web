import { render } from 'preact';
import { App } from './App';
import { startPolling } from './state/poller';
import './style.css';

render(<App />, document.getElementById('app')!);
startPolling();

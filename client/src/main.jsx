import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './index.css';

const socket = io(); // same origin as the page, so it works from any device
const role = location.pathname.startsWith('/waiter') ? 'Waiter' : 'Desktop';

function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');
  const [info, setInfo] = useState(null);
  const [online, setOnline] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setOnline(true);
    const onDisconnect = () => setOnline(false);
    socket.on('todos', setTodos);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (role === 'Desktop') fetch('/api/info').then((r) => r.json()).then(setInfo);
    return () => {
      socket.off('todos', setTodos);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const add = () => {
    if (!text.trim()) return;
    socket.emit('add', text.trim());
    setText('');
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{role}</h1>
        <span className={`badge ${online ? 'badge-success' : 'badge-error'}`}>
          {online ? 'connected' : 'offline'}
        </span>
      </div>

      {info && (
        <div className="card bg-base-200 p-4 items-center text-center">
          <img src={info.qr} alt="QR code for the waiter page" width="240" height="240" />
          <p className="text-sm break-all mt-2">{info.url}</p>
        </div>
      )}

      <div className="join w-full">
        <input
          className="input input-bordered join-item w-full"
          value={text}
          placeholder="New task"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary join-item" onClick={add}>Add</button>
      </div>

      <ul className="space-y-2">
        {todos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 bg-base-200 rounded-lg p-3">
            <input
              type="checkbox"
              className="checkbox"
              checked={!!t.done}
              onChange={() => socket.emit('toggle', t.id)}
            />
            <span className={`flex-1 ${t.done ? 'line-through opacity-60' : ''}`}>{t.text}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => socket.emit('remove', t.id)}>
              Delete
            </button>
          </li>
        ))}
        {todos.length === 0 && <li className="opacity-60">No tasks yet. Add one above.</li>}
      </ul>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

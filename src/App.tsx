import { useEffect, useRef, useState } from 'react';
import Ably from 'ably';

function App() {
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const client = new Ably.Realtime({
      key: import.meta.env.VITE_ABLY_API_KEY,
      clientId: import.meta.env.VITE_ABLY_CLIENT_ID,
    });

    client.connection.on('connected', () => {
      console.log('✅ Connected to Ably as:', client.auth.clientId);

      const channel = client.channels.get('mcp:hello');
      channelRef.current = channel;

       // 💠 Update agents on any presence change
      const refreshPresence = async () => {
        const members = await channel.presence.get();
        setAgents(members.map((m) => m.data));
      };

      channel.presence.subscribe(refreshPresence);
      refreshPresence();

       // 💠 Enter presence with agent info
      channel.presence.enter({
        agent_id: import.meta.env.VITE_ABLY_CLIENT_ID,
        tools: ['summarize', 'classify'],
        status: 'available',
      });
      
      channel.subscribe((msg) => {
        console.log(`📩 Received message [${msg.name}]:`, msg.data);
        setMessages((prev) => [...prev, msg]);
      });

      // Optional greeting on connect
      channel.publish('greeting', { text: `Hello from ${import.meta.env.VITE_ABLY_CLIENT_ID}!` });
    });

    return () => {
      client.close();
    };
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    channelRef.current?.publish('user-message', {
      text,
      from: import.meta.env.VITE_ABLY_CLIENT_ID,
      timestamp: Date.now(),
    });
    setInput('');
  };

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">🧠 Ably Agent Chat</h1>

      <div className="bg-gray-50 border rounded p-4 h-64 overflow-auto space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className="text-sm">
            <span className="font-semibold text-blue-600">{msg.name}</span>: {msg.data.text}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="border p-2 flex-1 rounded"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={handleSend}
        >
          Send
        </button>
      </div>

        <div className="border-t pt-4">
        <h2 className="text-md font-semibold mb-1">🟢 Online Agents</h2>
        <ul className="text-sm list-disc pl-5">
          {agents.map((agent, i) => (
            <li key={i}>
              {agent?.agent_id ?? 'unknown'} ({agent?.tools?.join(', ')})
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}

export default App;
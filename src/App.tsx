import { useEffect, useRef, useState } from 'react';
import Ably from 'ably';

class Agent {
  id: string;
  name: string;
  description: string;
  tools: string[];

  constructor(id: string, name: string, description: string, tools: string[]) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.tools = tools;
  }

  async invoke(input: string, tool: string) {
    return `tool: ${tool}, input: ${input}`;
  }
}

class LlamaAgent extends Agent {
  async invoke(input: string, tool: string) {
    switch (tool) {
      case 'summarize':
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3',
            prompt: input.text,
            stream: false,
          }),
        });
        const result = await response.json();
        return result.response;
      default:
        throw new Error(`Unsupported tool: ${tool}`);
    }
  }
}

class AgentRegistry {
  private static agents: Map<string, Agent> = new Map();

  static register(agent: Agent) {
    this.agents.set(agent.id, agent);
  }

  static find(id: string) {
    return this.agents.get(id);
  }

  static list() {
    return Array.from(this.agents.values());
  }
}

function App() {
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const channelRef = useRef<any>(null);

  AgentRegistry.register(new LlamaAgent('agent:ollama', 'Ollama', 'A simple agent that can summarize text.', ['summarize']));

  useEffect(() => {
    const client = new Ably.Realtime({
      key: import.meta.env.VITE_ABLY_API_KEY,
      clientId: import.meta.env.VITE_ABLY_CLIENT_ID,
    });

    client.connection.on('connected', () => {
      console.log('✅ Connected to Ably as:', client.auth.clientId);

      const channel = client.channels.get('mcp:hello');
      channelRef.current = channel;

      const agents = AgentRegistry.list();

      agents.forEach((agent) => {
        channel.presence.enter({
          agent_id: agent.id,
          tools: agent.tools,
          status: 'available',
        });
      });

      const refreshPresence = async () => {
        const members = await channel.presence.get();
        setAgents(members.map((m) => m.data));
      };

      channel.presence.subscribe(refreshPresence);
      refreshPresence();

      channel.subscribe(async (msg) => {
        console.log(`📩 Received message [${msg.name}]:`, msg.data);
        const data = msg.data;

        // Handle normal UI updates
        setMessages((prev) => [...prev, msg]);

        if (
          data.type === 'invoke'
        ) {
          console.log('🧠 Handling invoke request...');

          const agent = AgentRegistry.find(data.to);
          if (agent) {
            const response = await agent.invoke(data.input, data.tool);
            channel.publish(`Agent-Response (${data.to}):`, { text: response });
          } else {
            console.error('🚨 Agent not found:', data.to);
          }
        }
      });

      // Optional greeting on connect
      channel.publish('greeting', { text: `Hello from ${import.meta.env.VITE_ABLY_CLIENT_ID}!` });
    });

    return () => {
      client.close();
    };
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">🧠 Allochory Agent Exchange</h1>

      <div className="flex flex-row gap-6">
        {/* Left Column: 2/3 */}
        <div className="flex-1 space-y-4">
          <div className="bg-gray-50 border rounded p-4 h-64 overflow-auto space-y-2 text-black">
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
              onClick={() => {
                // Normal message (not LLM)
                channelRef.current?.publish(import.meta.env.VITE_ABLY_CLIENT_ID, {
                  text: input,
                  from: import.meta.env.VITE_ABLY_CLIENT_ID,
                  timestamp: Date.now(),
                });
                setInput('');
              }}
            >
              Send
            </button>

            <button
              className="bg-purple-600 text-white px-4 py-2 rounded"
              onClick={() => {
                // LLM-invoke message
                channelRef.current?.publish('Agent-Request:', {
                  type: 'invoke',
                  tool: 'summarize',
                  input: { text: input },
                  from: import.meta.env.VITE_ABLY_CLIENT_ID,
                  to: 'agent:ollama',
                  conversation_id: crypto.randomUUID(),
                });
                setInput('');
              }}
            >
              🧠 Invoke LLM
            </button>
          </div>
        </div>

        {/* Right Column: 1/3 */}
        <div className="w-1/3 bg-white border rounded p-4 h-64 overflow-auto text-black">
          <h2 className="text-md font-semibold mb-2">🟢 Online Agents</h2>
          <ul className="text-sm list-disc pl-5">
            {agents.map((agent, i) => (
              <li key={i}>
                {agent?.agent_id ?? 'unknown'} ({agent?.tools?.join(', ')})
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
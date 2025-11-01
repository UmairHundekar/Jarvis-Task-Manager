import { Router } from 'itty-router';
import { JarvisState } from './durable-object';
import { LLMService } from './llm-service';
import { Task } from './durable-object';

export interface Env {
  JARVIS_STATE: DurableObjectNamespace;
  AI: any;
}

const router = Router();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

router.options('*', () => new Response(null, { headers: corsHeaders }));

// Initialize schedule with tasks
router.post('/api/initialize', async (request, env: Env) => {
  try {
    const { userId, tasks } = await request.json<{ userId: string; tasks: string[] }>();
    
    if (!userId || !tasks || !Array.isArray(tasks)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Record the start time when the request is made and round to next minute
    // If it's 10:23:45, we want 10:24:00
    const now = Date.now();
    const nextMinute = Math.ceil(now / 60000) * 60000; // Round up to next minute
    const startTime = nextMinute;

    // Get Durable Object for this user
    const id = env.JARVIS_STATE.idFromName(userId);
    const stub = env.JARVIS_STATE.get(id);

    // Generate schedule using LLM
    const llmService = new LLMService(env.AI);
    const llmSchedule = await llmService.generateSchedule(tasks);

    // Log LLM response for debugging
    console.log('LLM Schedule Response:', JSON.stringify(llmSchedule, null, 2));

    // Convert LLM schedule to our Task format and validate durations
    const scheduleTasks: Task[] = llmSchedule.tasks.map((task: any, index: number) => {
      const duration = task.duration || task.estimated_duration || 30; // Try multiple field names
      const validatedDuration = Math.max(5, Math.min(parseInt(duration) || 30, 480));
      
      console.log(`Task ${index}: ${task.name} - Duration: ${duration} -> ${validatedDuration} minutes`);
      
      return {
        id: `task-${startTime}-${index}`,
        name: task.name,
        duration: validatedDuration,
        completed: false
      };
    });

    // Initialize schedule in Durable Object with the recorded start time
    const response = await stub.fetch(new Request('http://localhost/initialize', {
      method: 'POST',
      body: JSON.stringify({ userId, tasks: scheduleTasks, startTime })
    }));

    const schedule = await response.json();

    return new Response(JSON.stringify({
      schedule,
      commentary: llmSchedule.commentary || "Schedule created successfully."
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Get current state
router.get('/api/state/:userId', async (request, env: Env) => {
  try {
    const userId = request.params.userId;
    const id = env.JARVIS_STATE.idFromName(userId);
    const stub = env.JARVIS_STATE.get(id);

    const response = await stub.fetch(new Request('http://localhost/state'));
    const state = await response.json();

    return new Response(JSON.stringify(state), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Update task status
router.post('/api/task/update', async (request, env: Env) => {
  try {
    const { userId, taskId, completed } = await request.json<{
      userId: string;
      taskId: string;
      completed: boolean;
    }>();

    const id = env.JARVIS_STATE.idFromName(userId);
    const stub = env.JARVIS_STATE.get(id);

    const response = await stub.fetch(new Request('http://localhost/update-task', {
      method: 'POST',
      body: JSON.stringify({ taskId, completed })
    }));

    const schedule = await response.json();

    // Generate commentary
    const llmService = new LLMService(env.AI);
    const currentTask = schedule.tasks[schedule.currentTaskIndex];
    const progress = {
      completed: schedule.tasks.filter((t: Task) => t.completed).length,
      total: schedule.tasks.length
    };
    const commentary = await llmService.generateCommentary(currentTask, schedule, progress);

    return new Response(JSON.stringify({ schedule, commentary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Get current progress with commentary
router.get('/api/progress/:userId', async (request, env: Env) => {
  try {
    const userId = request.params.userId;
    const id = env.JARVIS_STATE.idFromName(userId);
    const stub = env.JARVIS_STATE.get(id);

    const response = await stub.fetch(new Request('http://localhost/schedule'));
    
    if (!response.ok) {
      return new Response(JSON.stringify({
        message: "No active schedule. Please initialize your tasks first."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const schedule = await response.json();

    // Check if schedule is null or invalid
    if (!schedule || schedule === null || !schedule.tasks || !Array.isArray(schedule.tasks) || schedule.tasks.length === 0) {
      return new Response(JSON.stringify({
        message: "No active schedule. Please initialize your tasks first."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update currentTaskIndex based on current time (which task should be active now)
    const now = Date.now();
    let activeTaskIndex = schedule.currentTaskIndex;
    
    // Find the current active task based on time
    for (let i = 0; i < schedule.tasks.length; i++) {
      const task = schedule.tasks[i];
      if (task.startTime && now >= task.startTime) {
        // If task hasn't ended or is not completed, it's the active task
        if (!task.endTime || now < task.endTime || !task.completed) {
          activeTaskIndex = i;
          break;
        }
      }
    }
    
    // Update the schedule's currentTaskIndex if it changed
    if (activeTaskIndex !== schedule.currentTaskIndex) {
      schedule.currentTaskIndex = activeTaskIndex;
      // Save updated schedule
      await stub.fetch(new Request('http://localhost/initialize', {
        method: 'POST',
        body: JSON.stringify({ 
          userId, 
          tasks: schedule.tasks, 
          startTime: schedule.startTime,
          updateCurrentIndex: true,
          currentTaskIndex: activeTaskIndex
        })
      }));
    }

    const currentTask = schedule.tasks[activeTaskIndex];
    const progress = {
      completed: schedule.tasks.filter((t: Task) => t.completed).length,
      total: schedule.tasks.length
    };

    const llmService = new LLMService(env.AI);
    const commentary = await llmService.generateCommentary(currentTask, schedule, progress);

    // Calculate time until next break (using the same 'now' variable)
    const nextBreak = schedule.breaks?.find((b: any) => b.time > now);
    const breakTimeRemaining = nextBreak ? Math.floor((nextBreak.time - now) / 60000) : null;

    const timeRemaining = currentTask.endTime ? Math.max(0, Math.floor((currentTask.endTime - now) / 60000)) : 0;

    return new Response(JSON.stringify({
      currentTask: {
        ...currentTask,
        timeRemaining,
        breakTimeRemaining
      },
      progress,
      commentary,
      schedule
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Chat endpoint
router.post('/api/chat', async (request, env: Env) => {
  try {
    const { userId, message } = await request.json<{ userId: string; message: string }>();

    const id = env.JARVIS_STATE.idFromName(userId);
    const stub = env.JARVIS_STATE.get(id);

    // Get conversation history
    let conversationHistory: any[] = [];
    try {
      const stateResponse = await stub.fetch(new Request('http://localhost/state'));
      if (stateResponse.ok) {
        const state = await stateResponse.json();
        conversationHistory = state.conversationHistory || [];
      }
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      // Continue with empty history
    }

    // Process with LLM
    const llmService = new LLMService(env.AI);
    let responseText: string;
    
    console.log('Processing chat message:', message);
    console.log('Conversation history length:', conversationHistory.length);
    
    try {
      responseText = await llmService.processUserInput(message, conversationHistory);
      console.log('Chat response:', responseText);
    } catch (error: any) {
      console.error('LLM processing error:', error);
      console.error('Error stack:', error.stack);
      
      // Provide a more helpful response based on common error types
      if (error.message && error.message.includes('quota')) {
        responseText = "I've reached my processing limit for the moment. Please try again in a few moments.";
      } else if (error.message && error.message.includes('timeout')) {
        responseText = "The request is taking longer than expected. Please try again.";
      } else {
        responseText = "I understand. Let's focus on your scheduled tasks for now. How can I assist you with your schedule?";
      }
    }

    // Save messages (don't fail if this errors)
    try {
      await stub.fetch(new Request('http://localhost/add-message', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: message })
      }));

      await stub.fetch(new Request('http://localhost/add-message', {
        method: 'POST',
        body: JSON.stringify({ role: 'assistant', content: responseText })
      }));
    } catch (error) {
      console.error('Error saving messages:', error);
      // Continue anyway
    }

    return new Response(JSON.stringify({ response: responseText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// WebSocket upgrade for real-time updates
router.get('/ws/:userId', async (request, env: Env) => {
  const userId = request.params.userId;
  const upgradeHeader = request.headers.get('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  acceptWebSocket(server, userId, env);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

function acceptWebSocket(ws: WebSocket, userId: string, env: Env) {
  ws.accept();

  // Send progress updates every 30 seconds
  const interval = setInterval(async () => {
    try {
      const id = env.JARVIS_STATE.idFromName(userId);
      const stub = env.JARVIS_STATE.get(id);
      const response = await stub.fetch(new Request('http://localhost/schedule'));
      const schedule = await response.json();

      if (schedule && schedule.tasks) {
        const currentTask = schedule.tasks[schedule.currentTaskIndex];
        const now = Date.now();
        const timeRemaining = currentTask.endTime ? Math.max(0, Math.floor((currentTask.endTime - now) / 60000)) : 0;

        ws.send(JSON.stringify({
          type: 'progress',
          currentTask,
          timeRemaining
        }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  }, 30000);

  ws.addEventListener('close', () => {
    clearInterval(interval);
  });
}

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx).catch((err) => {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    });
  }
};

export { JarvisState };

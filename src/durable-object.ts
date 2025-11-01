export interface Task {
  id: string;
  name: string;
  duration: number; // minutes
  completed: boolean;
  startTime?: number;
  endTime?: number;
}

export interface Schedule {
  tasks: Task[];
  breaks: { time: number; duration: number }[];
  startTime: number;
  currentTaskIndex: number;
  status: 'idle' | 'planning' | 'active' | 'completed';
}

export interface JarvisStateData {
  schedule: Schedule | null;
  userId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
}

export class JarvisState {
  state: DurableObjectState;
  env: any;
  
  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST') {
      if (path === '/initialize') {
        const { userId, tasks, startTime } = await request.json();
        return this.initializeSchedule(userId, tasks, startTime);
      } else if (path === '/update-task') {
        const { taskId, completed } = await request.json();
        return this.updateTask(taskId, completed);
      } else if (path === '/get-state') {
        return this.getState();
      } else if (path === '/add-message') {
        const { role, content } = await request.json();
        return this.addMessage(role, content);
      }
    } else if (request.method === 'GET') {
      if (path === '/state') {
        return this.getState();
      } else if (path === '/schedule') {
        return this.getSchedule();
      }
    }

    return new Response('Not found', { status: 404 });
  }

  async initializeSchedule(userId: string, tasks: Task[], startTime?: number, updateCurrentIndex?: boolean, currentTaskIndex?: number): Promise<Response> {
    // If we're just updating the currentTaskIndex, get existing schedule
    if (updateCurrentIndex && currentTaskIndex !== undefined) {
      const existingSchedule = await this.state.storage.get<Schedule>('schedule');
      if (existingSchedule) {
        existingSchedule.currentTaskIndex = currentTaskIndex;
        await this.state.storage.put({ schedule: existingSchedule });
        return new Response(JSON.stringify(existingSchedule), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Use provided startTime (from request time) or current time as fallback
    const scheduleStartTime = startTime || Date.now();
    
    const schedule: Schedule = {
      tasks,
      breaks: [],
      startTime: scheduleStartTime,
      currentTaskIndex: 0,
      status: 'planning'
    };

    // Calculate break times (every 90 minutes, 15 min break)
    let currentTime = schedule.startTime;
    const breakInterval = 90 * 60 * 1000; // 90 minutes
    const breakDuration = 15 * 60 * 1000; // 15 minutes
    let taskEndTime = currentTime;

    for (const task of tasks) {
      taskEndTime += task.duration * 60 * 1000;
      
      // Check if we need a break before this task
      if (taskEndTime - currentTime > breakInterval) {
        const breakTime = currentTime + breakInterval;
        schedule.breaks.push({
          time: breakTime,
          duration: breakDuration
        });
        currentTime = breakTime + breakDuration;
        taskEndTime = currentTime + task.duration * 60 * 1000;
      }
      
      task.startTime = currentTime;
      task.endTime = taskEndTime;
      currentTime = taskEndTime;
    }

    schedule.status = 'active';

    await this.state.storage.put({
      schedule,
      userId,
      conversationHistory: []
    });

    return new Response(JSON.stringify(schedule), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async updateTask(taskId: string, completed: boolean): Promise<Response> {
    const schedule = await this.state.storage.get<Schedule>('schedule');

    if (!schedule) {
      return new Response(JSON.stringify({ error: 'No schedule found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const task = schedule.tasks.find(t => t.id === taskId);
    if (!task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    task.completed = completed;
    
    // Move to next task if completed
    if (completed && schedule.currentTaskIndex < schedule.tasks.length - 1) {
      schedule.currentTaskIndex++;
    }

    await this.state.storage.put({ schedule });

    return new Response(JSON.stringify(schedule), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getState(): Promise<Response> {
    const data = await this.state.storage.get<JarvisStateData>([
      'schedule',
      'userId',
      'conversationHistory'
    ]);

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getSchedule(): Promise<Response> {
    const schedule = await this.state.storage.get<Schedule>('schedule');
    
    if (!schedule || schedule === null) {
      return new Response(JSON.stringify(null), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(schedule), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async addMessage(role: 'user' | 'assistant', content: string): Promise<Response> {
    const data = await this.state.storage.get<JarvisStateData>([
      'schedule',
      'userId',
      'conversationHistory'
    ]);

    const history = data.conversationHistory || [];
    history.push({
      role,
      content,
      timestamp: Date.now()
    });

    await this.state.storage.put({ conversationHistory: history });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

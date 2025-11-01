export class LLMService {
  private ai: any;
  private modelName: string;

  constructor(ai: any) {
    this.ai = ai;
    // Try these models in order of preference
    this.modelName = '@cf/meta/llama-3.1-8b-instruct';
  }

  // Helper to try multiple models with fallback
  private async tryRunModel(models: string[], options: any): Promise<any> {
    let lastError: any = null;
    
    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        const response = await this.ai.run(model, options);
        console.log(`Success with model: ${model}`);
        return response;
      } catch (error: any) {
        console.warn(`Model ${model} failed:`, error.message);
        lastError = error;
        // Continue to next model
      }
    }
    
    throw lastError || new Error('All models failed');
  }

  async generateSchedule(tasks: string[]): Promise<any> {
    const prompt = `You are Jarvis from Iron Man, a sophisticated AI assistant. A user wants to complete these tasks today: ${tasks.join(', ')}.

Create a detailed schedule for these tasks. Consider:
- Task complexity and priority
- Realistic time estimates in MINUTES (be specific - e.g., 30 minutes for a quick task, 90 minutes for a complex task)
- Natural break intervals (every 90 minutes, 15 min breaks)
- Optimal task ordering based on priority and dependencies

IMPORTANT: Provide realistic duration estimates for each task in MINUTES. Simple tasks should be 15-30 minutes, medium tasks 45-90 minutes, complex tasks 90-180 minutes.

Return ONLY a JSON object with this structure. Make sure each task has a "duration" field in MINUTES (a number, not text):
{
  "tasks": [
    {
      "name": "task name",
      "duration": 45,
      "priority": "high|medium|low",
      "description": "brief description"
    }
  ],
  "commentary": "A brief Jarvis-style comment about this schedule"
}

CRITICAL: The "duration" field MUST be a NUMBER in minutes. Do NOT use "160" for all tasks - provide realistic estimates based on task complexity.`;

    try {
      // Try multiple models with fallback
      const models = [
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-2-7b-chat-int8',
        '@cf/mistral/mistral-7b-instruct-v0.1'
      ];
      
      const response = await this.tryRunModel(models, {
        messages: [
          {
            role: 'system',
            content: 'You are Jarvis from Iron Man. You are sophisticated, efficient, and slightly witty. You MUST respond ONLY with valid JSON. No explanations, no markdown, just pure JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent JSON output
        max_tokens: 2000
      });

      // Parse the response - Workers AI returns response in different formats
      const content = response.response || response.text || (typeof response === 'string' ? response : JSON.stringify(response));
      
      console.log('Raw LLM Response:', content);
      
      let parsed;
      
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        // Try parsing the whole response
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          // Try to find JSON object in the response
          const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            parsed = JSON.parse(jsonObjectMatch[0]);
          } else {
            throw new Error('Could not parse LLM response as JSON');
          }
        }
      }

      // Validate that we got tasks with durations
      if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
        console.error('Invalid LLM response structure:', parsed);
        throw new Error('LLM did not return valid tasks array');
      }

      // Ensure all tasks have durations
      parsed.tasks = parsed.tasks.map((task: any, index: number) => {
        if (!task.duration || isNaN(task.duration)) {
          console.warn(`Task ${index} missing duration, estimating based on name: ${task.name}`);
          // Estimate based on task name length/complexity
          const estimatedDuration = task.name.length > 50 ? 90 : task.name.length > 30 ? 45 : 30;
          task.duration = estimatedDuration;
        }
        return task;
      });

      console.log('Parsed LLM Schedule:', JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (error) {
      console.error('LLM Error:', error);
      // Fallback: create a simple schedule
      return this.createFallbackSchedule(tasks);
    }
  }

  private createFallbackSchedule(tasks: string[]): any {
    // Use smarter duration estimation based on task complexity
    const taskDurations = tasks.map((task, index) => {
      // Estimate duration based on task name length and complexity
      const nameLength = task.length;
      let duration;
      
      if (nameLength < 20) {
        duration = 30; // Quick tasks
      } else if (nameLength < 40) {
        duration = 60; // Medium tasks
      } else if (nameLength < 60) {
        duration = 90; // Complex tasks
      } else {
        duration = 120; // Very complex tasks
      }
      
      // Adjust for first/last tasks (usually take longer)
      if (index === 0) duration += 15; // First task prep time
      if (index === tasks.length - 1) duration += 15; // Last task wrap-up time
      
      return duration;
    });
    
    return {
      tasks: tasks.map((task, index) => ({
        name: task,
        duration: taskDurations[index],
        priority: index < tasks.length / 3 ? 'high' : index < tasks.length * 2 / 3 ? 'medium' : 'low',
        description: `Complete ${task}`
      })),
      commentary: "I've created an optimized schedule for your tasks. Let's make today productive, shall we?"
    };
  }

  async generateCommentary(
    currentTask: any,
    schedule: any,
    progress: { completed: number; total: number }
  ): Promise<string> {
    const now = Date.now();
    const timeRemaining = currentTask.endTime ? Math.max(0, currentTask.endTime - now) : 0;
    const minutesRemaining = Math.floor(timeRemaining / 60000);
    
    // Find next break
    const nextBreak = schedule.breaks?.find((b: any) => b.time > now);
    const breakTimeRemaining = nextBreak ? Math.floor((nextBreak.time - now) / 60000) : null;

    const prompt = `You are Jarvis from Iron Man. Provide a brief, motivational commentary about the user's current progress.

Current situation:
- Task: ${currentTask.name}
- Time remaining: ${minutesRemaining} minutes
- Next break: ${breakTimeRemaining ? `${breakTimeRemaining} minutes` : 'none scheduled'}
- Progress: ${progress.completed}/${progress.total} tasks completed

Provide a short (2-3 sentences) Jarvis-style comment. Be encouraging, efficient, and slightly witty.`;

    try {
      const models = [
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-2-7b-chat-int8',
        '@cf/mistral/mistral-7b-instruct-v0.1'
      ];
      
      const response = await this.tryRunModel(models, {
        messages: [
          {
            role: 'system',
            content: 'You are Jarvis from Iron Man. Be concise, sophisticated, and encouraging.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150
      });

      const result = response.response || response.text || response.content;
      if (!result || result.trim().length === 0) {
        return this.createFallbackCommentary(minutesRemaining, breakTimeRemaining, progress);
      }
      return result;
    } catch (error: any) {
      console.error('LLM Commentary Error:', error);
      return this.createFallbackCommentary(minutesRemaining, breakTimeRemaining, progress);
    }
  }

  private createFallbackCommentary(minutesRemaining: number, breakTimeRemaining: number | null, progress: any): string {
    let comment = `You're currently working on a task with ${minutesRemaining} minutes remaining. `;
    
    if (breakTimeRemaining) {
      comment += `Your next break is in ${breakTimeRemaining} minutes. `;
    }
    
    comment += `You've completed ${progress.completed} of ${progress.total} tasks. Excellent work.`;
    
    return comment;
  }

  async processUserInput(userMessage: string, conversationHistory: any[]): Promise<string> {
    const prompt = userMessage; // Use user message directly, system will handle the role

    try {
      const messages: any[] = [];

      // Add conversation history (last 5 messages)
      const recentHistory = conversationHistory.slice(-5);
      recentHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });

      // Add current user message
      messages.push({
        role: 'user',
        content: prompt
      });

      console.log('Chat messages:', JSON.stringify(messages, null, 2));

      const models = [
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-2-7b-chat-int8',
        '@cf/mistral/mistral-7b-instruct-v0.1'
      ];
      
      const response = await this.tryRunModel(models, {
        messages,
        temperature: 0.7,
        max_tokens: 200
      });

      console.log('Chat LLM response:', JSON.stringify(response, null, 2));

      // Workers AI returns response differently - try multiple formats
      let result = '';
      if (typeof response === 'string') {
        result = response;
      } else if (response.response) {
        result = response.response;
      } else if (response.text) {
        result = response.text;
      } else if (response.content) {
        result = response.content;
      } else if (response.choices && response.choices[0] && response.choices[0].message) {
        result = response.choices[0].message.content;
      } else {
        // Try to extract text from response object
        const responseStr = JSON.stringify(response);
        console.warn('Unexpected response format:', responseStr);
        result = responseStr;
      }

      if (!result || result.trim().length === 0) {
        console.warn('Empty response from LLM');
        return "Understood. How may I assist you further?";
      }

      // Clean up the result
      result = result.trim();
      
      // Remove markdown code blocks if present
      result = result.replace(/```[\s\S]*?```/g, '').trim();
      
      return result;
    } catch (error: any) {
      console.error('LLM Chat Error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Return a helpful Jarvis-style fallback
      return "I understand. Unfortunately, I'm experiencing a momentary processing delay. Please try asking again, or we can continue with your scheduled tasks.";
    }
  }
}

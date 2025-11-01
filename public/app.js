// Configuration - Update with your Worker URL
const API_BASE_URL = 'https://jarvis-task-scheduler.umairmhundekar.workers.dev';

// Get or create user ID
let userId = localStorage.getItem('jarvis_user_id');
if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('jarvis_user_id', userId);
}

let currentSchedule = null;
let progressInterval = null;

// DOM Elements
const setupSection = document.getElementById('setup-section');
const scheduleSection = document.getElementById('schedule-section');
const taskInput = document.getElementById('task-input');
const createScheduleBtn = document.getElementById('create-schedule-btn');
const refreshProgressBtn = document.getElementById('refresh-progress-btn');
const commentaryText = document.getElementById('commentary-text');
const progressText = document.getElementById('progress-text');
const progressPercentage = document.getElementById('progress-percentage');
const progressFill = document.getElementById('progress-fill');
const currentTaskName = document.getElementById('current-task-name');
const currentTaskStatus = document.getElementById('current-task-status');
const taskTimeRemaining = document.getElementById('task-time-remaining');
const breakTimeRemaining = document.getElementById('break-time-remaining');
const tasksContainer = document.getElementById('tasks-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// Initialize schedule
createScheduleBtn.addEventListener('click', async () => {
    const tasksText = taskInput.value.trim();
    if (!tasksText) {
        alert('Please enter at least one task.');
        return;
    }

    // Parse tasks (comma or newline separated)
    const tasks = tasksText
        .split(/[,\n]/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

    if (tasks.length === 0) {
        alert('Please enter at least one valid task.');
        return;
    }

    createScheduleBtn.disabled = true;
    createScheduleBtn.textContent = 'Creating Schedule...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/initialize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId,
                tasks
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create schedule');
        }

        const data = await response.json();
        currentSchedule = data.schedule;
        
        // Show commentary
        commentaryText.textContent = data.commentary || 'Schedule created successfully.';
        
        // Show schedule section
        setupSection.classList.add('hidden');
        scheduleSection.classList.remove('hidden');
        
        // Render schedule
        renderSchedule(data.schedule);
        
        // Start progress updates
        startProgressUpdates();
        
        // Add welcome message
        addChatMessage('assistant', `I've created your schedule for today. You have ${data.schedule.tasks.length} tasks to complete. Let's make today productive, shall we?`);
        
    } catch (error) {
        console.error('Error creating schedule:', error);
        alert('Failed to create schedule. Please try again.');
    } finally {
        createScheduleBtn.disabled = false;
        createScheduleBtn.textContent = 'Create Schedule';
    }
});

// Refresh progress
refreshProgressBtn.addEventListener('click', () => {
    updateProgress();
});

// Update progress
async function updateProgress() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/progress/${userId}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch progress');
        }

        const data = await response.json();
        
        if (data.message) {
            commentaryText.textContent = data.message;
            return;
        }

        currentSchedule = data.schedule;
        
        // Update commentary
        commentaryText.textContent = data.commentary || 'Progress updated.';
        
        // Update progress bar
        const percentage = Math.round((data.progress.completed / data.progress.total) * 100);
        progressText.textContent = `${data.progress.completed} / ${data.progress.total} tasks completed`;
        progressPercentage.textContent = `${percentage}%`;
        progressFill.style.width = `${percentage}%`;
        
        // Update current task
        const currentTask = data.currentTask;
        currentTaskName.textContent = currentTask.name;
        
        // Update timing
        const minutes = currentTask.timeRemaining || 0;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (minutes > 0) {
            if (hours > 0) {
                taskTimeRemaining.textContent = `⏱️ Time remaining: ${hours}h ${mins}m`;
            } else {
                taskTimeRemaining.textContent = `⏱️ Time remaining: ${mins}m`;
            }
        } else {
            taskTimeRemaining.textContent = `⏱️ Time remaining: Completed`;
        }
        
        if (currentTask.breakTimeRemaining) {
            const breakMinutes = currentTask.breakTimeRemaining;
            const breakHours = Math.floor(breakMinutes / 60);
            const breakMins = breakMinutes % 60;
            
            if (breakHours > 0) {
                breakTimeRemaining.textContent = `☕ Next break: ${breakHours}h ${breakMins}m`;
            } else {
                breakTimeRemaining.textContent = `☕ Next break: ${breakMins}m`;
            }
        } else {
            breakTimeRemaining.textContent = `☕ Next break: None scheduled`;
        }
        
        // Render tasks
        renderSchedule(data.schedule);
        
    } catch (error) {
        console.error('Error updating progress:', error);
    }
}

// Render schedule
function renderSchedule(schedule) {
    if (!schedule || !schedule.tasks) return;
    
    tasksContainer.innerHTML = '';
    
    schedule.tasks.forEach((task, index) => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        if (task.completed) {
            taskItem.classList.add('completed');
        }
        
        if (index === schedule.currentTaskIndex) {
            taskItem.classList.add('current');
        }
        
        // Format times in user's local timezone
        const startTime = task.startTime ? new Date(task.startTime).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true,
          timeZoneName: 'short'
        }) : '';
        const endTime = task.endTime ? new Date(task.endTime).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true,
          timeZoneName: 'short'
        }) : '';
        
        taskItem.innerHTML = `
            <div class="task-item-content">
                <div class="task-item-name">${task.name}</div>
                <div class="task-item-time">${startTime} - ${endTime} (${task.duration} min)</div>
            </div>
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                   data-task-id="${task.id}" />
        `;
        
        const checkbox = taskItem.querySelector('.task-checkbox');
        checkbox.addEventListener('change', async (e) => {
            const completed = e.target.checked;
            await updateTaskStatus(task.id, completed);
        });
        
        tasksContainer.appendChild(taskItem);
    });
}

// Update task status
async function updateTaskStatus(taskId, completed) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/task/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId,
                taskId,
                completed
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update task');
        }

        const data = await response.json();
        currentSchedule = data.schedule;
        
        // Update commentary
        commentaryText.textContent = data.commentary || 'Task updated.';
        
        // Refresh progress
        await updateProgress();
        
    } catch (error) {
        console.error('Error updating task:', error);
        alert('Failed to update task. Please try again.');
    }
}

// Start progress updates
function startProgressUpdates() {
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    // Update immediately
    updateProgress();
    
    // Update every 30 seconds
    progressInterval = setInterval(updateProgress, 30000);
}

// Chat functionality
sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addChatMessage('user', message);
    chatInput.value = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId,
                message
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        const data = await response.json();
        addChatMessage('assistant', data.response);
        
    } catch (error) {
        console.error('Error sending message:', error);
        addChatMessage('assistant', "I'm sorry, I encountered an error. Please try again.");
    }
}

function addChatMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const header = role === 'assistant' ? 'Jarvis' : 'You';
    
    messageDiv.innerHTML = `
        <div class="message-header">${header}</div>
        <div>${content}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize - check if schedule exists
window.addEventListener('load', async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/state/${userId}`);
        
        if (response.ok) {
            const state = await response.json();
            if (state.schedule && state.schedule.tasks && state.schedule.tasks.length > 0) {
                currentSchedule = state.schedule;
                setupSection.classList.add('hidden');
                scheduleSection.classList.remove('hidden');
                renderSchedule(state.schedule);
                startProgressUpdates();
                updateProgress();
            }
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
});

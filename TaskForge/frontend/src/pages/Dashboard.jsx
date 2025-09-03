/**
 * Dashboard Page Component
 * Main dashboard with overview statistics and recent activity
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user } = useAuth();

  // Mock data - replace with API calls
  const stats = [
    { name: 'Total Projects', value: '12', icon: FolderIcon, color: 'bg-blue-500' },
    { name: 'Active Tasks', value: '24', icon: ClipboardDocumentListIcon, color: 'bg-purple-500' },
    { name: 'Completed Tasks', value: '67', icon: CheckCircleIcon, color: 'bg-green-500' },
    { name: 'Team Members', value: '8', icon: UsersIcon, color: 'bg-orange-500' }
  ];

  const recentTasks = [
    { id: 1, title: 'Update user documentation', project: 'Website Redesign', priority: 'high', status: 'in_progress' },
    { id: 2, title: 'Fix login bug', project: 'Mobile App', priority: 'urgent', status: 'todo' },
    { id: 3, title: 'Review pull request', project: 'API Development', priority: 'medium', status: 'review' }
  ];

  const recentProjects = [
    { id: 1, name: 'Website Redesign', taskCount: 15, completedTasks: 8, color: '#3B82F6' },
    { id: 2, name: 'Mobile App', taskCount: 23, completedTasks: 12, color: '#8B5CF6' },
    { id: 3, name: 'API Development', taskCount: 18, completedTasks: 16, color: '#10B981' }
  ];

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name}!
        </h1>
        <p className="text-gray-600 mt-1">
          Here's what's happening with your projects today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Tasks</h2>
            <Link to="/tasks" className="text-sm text-primary-600 hover:text-primary-700">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {recentTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  <p className="text-xs text-gray-500">{task.project}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`priority-${task.priority}`}>
                    {task.priority}
                  </span>
                  <span className={`status-${task.status.replace('_', '-')}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Projects */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Projects</h2>
            <Link to="/projects" className="text-sm text-primary-600 hover:text-primary-700">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {recentProjects.map((project) => (
              <div key={project.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: project.color }}
                    />
                    <p className="text-sm font-medium text-gray-900">{project.name}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {project.completedTasks}/{project.taskCount} tasks
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${(project.completedTasks / project.taskCount) * 100}%`,
                      backgroundColor: project.color 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 p-6 bg-gradient-to-r from-primary-50 to-primary-100 rounded-lg">
        <h3 className="text-lg font-semibold text-primary-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/projects" className="btn-secondary text-center">
            Create New Project
          </Link>
          <Link to="/tasks" className="btn-secondary text-center">
            Add New Task
          </Link>
          <Link to="/users" className="btn-secondary text-center">
            Invite Team Member
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
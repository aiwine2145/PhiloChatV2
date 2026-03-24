import React, { useState } from 'react';
import { Philosopher } from '../data/philosophers';
import { LucideIcon } from 'lucide-react';

interface PhilosopherAvatarProps {
  philosopher: Philosopher;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Using the GitHub account provided in the request
const GITHUB_ACCOUNT = 'aiwine2145';
const BASE_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_ACCOUNT}/philochat-assets@main/`;

export default function PhilosopherAvatar({ philosopher, size = 'md', className = '' }: PhilosopherAvatarProps) {
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-24 h-24',
  };

  const iconSizeClasses = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-12 h-12',
  };

  const avatarUrl = `${BASE_URL}${philosopher.id.toLowerCase()}.png`;

  return (
    <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center shrink-0 border border-slate-600 relative overflow-hidden ${philosopher.bg} ${philosopher.color} ${className}`}>
      {/* Fallback Icon (Visible if image fails or is loading) */}
      <philosopher.icon className={iconSizeClasses[size]} />
      
      {/* Philosopher Avatar Image */}
      <img
        src={avatarUrl}
        alt={philosopher.name}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover rounded-full"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

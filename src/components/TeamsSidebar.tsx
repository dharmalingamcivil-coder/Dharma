import React, { useState } from 'react';
import { 
  Plus, 
  Hash, 
  MessageSquare, 
  Radio, 
  Users, 
  ChevronDown, 
  ChevronRight, 
  Lock, 
  UserPlus, 
  RefreshCw, 
  LogOut,
  X,
  Search,
  Smartphone
} from 'lucide-react';
import { Team, Channel, ChatRoom, User } from '../types.js';

interface TeamsSidebarProps {
  currentUser: User | null;
  teams: Team[];
  chatRooms: ChatRoom[];
  allUsers: User[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string, type: 'channel' | 'direct' | 'group') => void;
  onCreateTeam: (name: string, desc: string) => void;
  onCreateChannel: (teamId: string, name: string, desc: string) => void;
  onStartDirectChat: (targetUser: User) => void;
  onLogout: () => void;
  onRefreshAll: () => void;
  onCreateGroupChat: (name: string, selectedMemberIds: string[]) => void;
  onShowMobileHelp?: () => void;
}

export default function TeamsSidebar({
  currentUser,
  teams,
  chatRooms,
  allUsers,
  activeRoomId,
  onSelectRoom,
  onCreateTeam,
  onCreateChannel,
  onStartDirectChat,
  onLogout,
  onRefreshAll,
  onCreateGroupChat,
  onShowMobileHelp
}: TeamsSidebarProps) {
  // Navigation lists expansion states
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({
    'team-hq': true // pre-expand seeded hq team
  });
  
  // Modals / inline structures toggle states
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  const [showNewChannel, setShowNewChannel] = useState<string | null>(null); // TeamId
  const [newChanName, setNewChanName] = useState('');
  const [newChanDesc, setNewChanDesc] = useState('');

  // Searing chats state
  const [searchQuery, setSearchQuery] = useState('');

  // Group creation states
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);

  const handleGroupMemberToggle = (userId: string) => {
    setSelectedGroupMembers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleNewGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || selectedGroupMembers.length === 0) return;
    onCreateGroupChat(newGroupName.trim(), selectedGroupMembers);
    setNewGroupName('');
    setSelectedGroupMembers([]);
    setShowNewGroup(false);
  };

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const handleNewTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    onCreateTeam(newTeamName.trim(), newTeamDesc.trim());
    setNewTeamName('');
    setNewTeamDesc('');
    setShowNewTeam(false);
  };

  const handleNewChannelSubmit = (e: React.FormEvent, teamId: string) => {
    e.preventDefault();
    if (!newChanName.trim()) return;
    onCreateChannel(teamId, newChanName.trim(), newChanDesc.trim());
    setNewChanName('');
    setNewChanDesc('');
    setShowNewChannel(null);
  };

  // Filter teams and channels based on search
  const filteredTeams = teams.map(t => {
    const matchesTeamName = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchedChannels = t.channels.filter(c => matchesTeamName || c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return {
      ...t,
      channels: matchedChannels,
      isMatched: matchesTeamName || matchedChannels.length > 0
    };
  }).filter(t => searchQuery === '' || t.isMatched);

  const totalChannelsCount = filteredTeams.reduce((sum, t) => sum + t.channels.length, 0);

  // Filter groups based on search
  const filteredGroups = chatRooms
    .filter(r => r.type === 'group')
    .filter(g => searchQuery === '' || (g.name && g.name.toLowerCase().includes(searchQuery.toLowerCase())))
    .filter(g => g.memberIds?.includes(currentUser?.id || ''));

  // Filter out self and bots from direct chat targets
  const dmTargets = allUsers
    .filter(u => u.id !== currentUser?.id)
    .filter(u => searchQuery === '' || u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()));

  const totalResultsCount = totalChannelsCount + filteredGroups.length + dmTargets.length;

  // Group DM chats and match display name
  const directChats = chatRooms.filter(r => r.type === 'direct');

  return (
    <div className="flex h-full w-full md:w-auto shrink-0" id="teams-sidebar-root">
      
      {/* Visual Component 1: Sidebar Rail (Width: 68px) */}
      <aside className="w-[68px] bg-[#ebebeb] border-r border-[#d1d5db] flex flex-col items-center py-5 shrink-0 justify-between select-none" id="sidebar-rail">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo / Brand Indicator */}
          <div className="text-[#6264A7] hover:scale-105 transition-transform cursor-pointer" title="Teams Secure Architecture">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            </svg>
          </div>

          <div className="w-8 h-px bg-[#d1d5db]" />

          {/* Activity Logs indicator */}
          <button type="button" className="text-slate-600 opacity-70 hover:opacity-100 transition-opacity p-2" title="Activity logs stream">
            <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>

          {/* Active Conversations (Chat) button */}
          <button type="button" className="text-[#6264A7] transition-all p-2 bg-[#f3f4f6]/40 border-l-[3.5px] border-[#6264A7] w-full flex justify-center pl-1.5" title="Decrypted Forums">
            <svg className="w-5.5 h-5.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
            </svg>
          </button>

          {/* Users network */}
          <button type="button" className="text-slate-600 opacity-70 hover:opacity-100 transition-opacity p-2" title="Secure Workspace Members">
            <svg className="w-5.5 h-5.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </button>

          {/* Events scheduling */}
          <button type="button" className="text-slate-600 opacity-70 hover:opacity-100 transition-opacity p-2" title="Shared Keys Schedule">
            <svg className="w-5.5 h-5.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/>
            </svg>
          </button>
        </div>

        {/* Dynamic Connected User status display inside Rail */}
        {currentUser && (
          <div className="relative group cursor-pointer" title={`Active identity: ${currentUser.name}`}>
            <div className="w-9 h-9 rounded-full bg-[#6264A7] text-white flex items-center justify-center font-bold text-xs select-none shadow-sm border border-white/20">
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#6bb700] border-2 border-white" />
          </div>
        )}
      </aside>

      {/* Visual Component 2: Main Conversations sidebar (Light White theme) */}
      <div className="w-full md:w-[300px] bg-white border-r border-[#e5e7eb] flex flex-col h-full shrink-0 flex-1 md:flex-initial min-w-0" id="chat-sidebar">
        {/* Header container */}
        <div className="padding-header p-4 border-b border-[#f3f4f6] flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-[#1f2937] tracking-tight">Chat Workspaces</h2>
            
            <button 
              type="button"
              onClick={onRefreshAll}
              className="text-slate-400 hover:text-[#6264A7] p-1 rounded hover:bg-slate-100 transition-all"
              title="Refresh Security handshakes"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Premium "Search chats" Input */}
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search workspaces & users" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-1.5 pl-8 pr-8 text-xs bg-[#f9fafb] text-slate-800 border border-[#d1d5db] rounded outline-none placeholder:text-gray-400 focus:border-[#6264A7] focus:bg-white transition-all animate-none"
            />
            <svg 
              className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-[#6264A7] transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list items */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-4">
          {searchQuery && totalResultsCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none">
              <Search className="w-8 h-8 text-slate-300 mb-2.5" />
              <p className="text-xs font-bold text-slate-700">No matches found</p>
              <p className="text-[10.5px] text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                No channels, groups, or direct messages match "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3.5 text-xs text-[#6264A7] hover:underline font-bold cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <>
              {/* Teams channel list */}
              <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-500 tracking-wider uppercase">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[#6264A7]" />
                <span>Secure Teams ({filteredTeams.length})</span>
              </span>
              <button 
                type="button"
                onClick={() => setShowNewTeam(true)}
                className="text-slate-400 hover:text-[#6264A7] hover:bg-slate-100 p-0.5 rounded transition-all"
                title="Create Team Vault"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Inline safe team creator popup */}
            {showNewTeam && (
              <form onSubmit={handleNewTeamSubmit} className="bg-slate-50/85 p-3 rounded border border-slate-200 mt-1 mb-2 flex flex-col gap-2">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase">Assemble Safe Workspace</h4>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name (e.g. Finance)"
                  className="w-full bg-white text-xs border border-slate-300 rounded p-1.5 focus:border-[#6264A7] outline-none text-slate-800"
                  required
                />
                <input
                  type="text"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="Key description..."
                  className="w-full bg-white text-xs border border-slate-300 rounded p-1.5 focus:border-[#6264A7] outline-none text-slate-800"
                />
                <div className="flex justify-end gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewTeam(false)}
                    className="text-[10px] px-2 py-1 border border-slate-300 hover:bg-slate-100 rounded text-slate-550 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#6264A7] hover:bg-[#525493] text-[10px] text-white px-2.5 py-1 rounded font-bold transition-colors"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Channels accordion items */}
            <div className="flex flex-col gap-0.5 mt-1">
              {filteredTeams.map(team => {
                const isExpanded = !!expandedTeams[team.id] || searchQuery.trim() !== '';
                return (
                  <div key={team.id} className="flex flex-col">
                    {/* Collapsible header */}
                    <div className="group flex items-center justify-between hover:bg-[#f9fafb] rounded-md p-1.5 cursor-pointer text-slate-700 transition-colors">
                      <div 
                        className="flex items-center gap-1.5 flex-1 min-w-0" 
                        onClick={() => toggleTeam(team.id)}
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        <span className="font-bold text-xs truncate text-[#1F2937] select-none">{team.name}</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => setShowNewChannel(team.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-opacity"
                        title="Add Secure Channel segment"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Channels nest */}
                    {isExpanded && (
                      <div className="pl-3 border-l border-slate-200 ml-3.5 mt-0.5 flex flex-col gap-0.5">
                        {showNewChannel === team.id && (
                          <form onSubmit={(e) => handleNewChannelSubmit(e, team.id)} className="bg-slate-50 p-2 rounded m-0.5 flex flex-col gap-1.5 border border-slate-200">
                            <input
                              type="text"
                              value={newChanName}
                              onChange={(e) => setNewChanName(e.target.value)}
                              placeholder="Channel segment name"
                              className="bg-white text-[11px] border border-slate-300 rounded p-1 focus:border-[#6264A7] outline-none text-slate-800"
                              required
                            />
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setShowNewChannel(null)}
                                className="text-[9px] px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 rounded"
                              >
                                Abort
                              </button>
                              <button
                                type="submit"
                                className="bg-[#6264A7] text-[9px] text-white px-2 py-0.5 rounded font-bold"
                              >
                                Add Segment
                              </button>
                            </div>
                          </form>
                        )}

                        {team.channels.map(chan => {
                          const isActive = activeRoomId === chan.id;
                          return (
                            <div
                              key={chan.id}
                              onClick={() => onSelectRoom(chan.id, 'channel')}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs cursor-pointer select-none truncate transition-all ${
                                isActive 
                                  ? 'bg-[#edeef7] text-[#6264A7] border-l-[3.5px] border-[#6264A7] font-bold' 
                                  : 'text-slate-600 hover:bg-[#f9fafb] hover:text-[#6264A7]'
                              }`}
                            >
                              <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{chan.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Secure Groups Section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-500 tracking-wider uppercase border-t border-slate-100 pt-4">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[#6264A7]" />
                <span>Group Chats ({searchQuery ? filteredGroups.length : chatRooms.filter(r => r.type === 'group' && r.memberIds?.includes(currentUser?.id || '')).length})</span>
              </span>
              <button 
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="text-slate-400 hover:text-[#6264A7] hover:bg-slate-100 p-0.5 rounded transition-all"
                title="Create Group Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Group Creator Form */}
            {showNewGroup && (
              <form onSubmit={handleNewGroupSubmit} className="bg-slate-50/85 p-3 rounded border border-slate-200 mt-1 mb-2 flex flex-col gap-2">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase">New E2EE Group Chat</h4>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name (e.g. Core Design)"
                  className="w-full bg-white text-xs border border-slate-300 rounded p-1.5 focus:border-[#6264A7] outline-none text-slate-800"
                  required
                />
                
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-slate-200 bg-white rounded p-1">
                  <span className="text-[10px] text-slate-400 font-semibold p-1 uppercase">Add Initial Members:</span>
                  {allUsers
                    .filter(u => u.id !== currentUser?.id)
                    .map(u => {
                      const isChecked = selectedGroupMembers.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 p-1 hover:bg-slate-50 rounded cursor-pointer text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleGroupMemberToggle(u.id)}
                            className="rounded border-gray-300 text-[#6264A7] focus:ring-[#6264A7]"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-700 leading-tight truncate">{u.name}</span>
                            <span className="text-[9px] text-slate-400 leading-tight truncate">{u.email}</span>
                          </div>
                        </label>
                      );
                    })}
                </div>

                <div className="flex justify-end gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewGroup(false);
                      setNewGroupName('');
                      setSelectedGroupMembers([]);
                    }}
                    className="text-[10px] px-2 py-1 border border-slate-300 hover:bg-slate-100 rounded text-slate-550 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newGroupName.trim() || selectedGroupMembers.length === 0}
                    className="bg-[#6264A7] hover:bg-[#525493] text-[10px] text-white px-2.5 py-1 rounded font-bold transition-colors disabled:opacity-40"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Group Chats list rendering */}
            <div className="flex flex-col gap-1 mt-1.5">
              {filteredGroups.map(group => {
                const isActive = activeRoomId === group.id;
                const adminUser = allUsers.find(u => u.id === group.adminId);

                  return (
                    <div
                      key={group.id}
                      onClick={() => onSelectRoom(group.id, 'group')}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer select-none transition-all ${
                        isActive 
                          ? 'bg-[#edeef7] text-[#6264A7] border-l-[3.5px] border-[#6264A7] font-bold' 
                          : 'text-slate-600 hover:bg-[#f9fafb]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#f3f4f6] border border-slate-200 font-bold text-[11px] text-[#6264A7] flex items-center justify-center select-none shrink-0">
                          {group.name ? group.name.slice(0, 2).toUpperCase() : 'GP'}
                        </div>
                        
                        <div className="flex flex-col min-w-0 leading-tight">
                          <span className="font-semibold text-slate-800 truncate text-[13px]">{group.name || 'Group Chat'}</span>
                          <span className="text-[10px] text-slate-450 truncate mt-0.5">
                            {group.memberIds ? group.memberIds.length : 0} members · Admin: {adminUser?.name.split(' ')[0] || 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Secure DM section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-500 tracking-wider uppercase border-t border-slate-100 pt-4">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-[#6264A7]" />
                <span>Secure Chats ({dmTargets.length})</span>
              </span>
            </div>

            <div className="flex flex-col gap-1 mt-1.5">
              {dmTargets.map(user => {
                const relatedRoom = directChats.find(r => r.memberIds.includes(user.id));
                const isActive = activeRoomId === relatedRoom?.id;
                const isOnline = user.status === 'online' || ['+18005550199', '+15550100200', '+15550200300'].includes(user.id);

                return (
                  <div
                    key={user.id}
                    onClick={() => onStartDirectChat(user)}
                    className={`flex items-center justify-between px-2.5 py-2.5 rounded-lg text-xs cursor-pointer select-none transition-all ${
                      isActive 
                        ? 'bg-[#edeef7] text-[#6264A7] border-l-[3.5px] border-[#6264A7] font-bold' 
                        : 'text-slate-600 hover:bg-[#f9fafb]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 font-bold text-[11px] text-[#6264A7] flex items-center justify-center select-none">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          isOnline ? 'bg-[#6bb700]' : 'bg-slate-400'
                        }`} />
                      </div>
                      
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="font-semibold text-slate-800 truncate text-[13px]">{user.name}</span>
                        <span className="text-[10px] text-slate-450 truncate mt-0.5">{user.email}</span>
                      </div>
                    </div>

                    {(user.id === '+18005550199') && (
                      <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[8px] font-bold border border-emerald-200 shrink-0 uppercase tracking-widest ml-1 scale-90">
                        AI bot
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>

        {/* User Workspace Info & Logout footer */}
        {currentUser && (
          <div className="p-3 border-t border-[#e5e7eb] bg-[#f9fafb] flex items-center justify-between gap-1.5 shrink-0" id="sidebar-footer">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8.5 h-8.5 rounded-full bg-[#6264A7] font-bold text-xs text-white flex items-center justify-center border border-white/10 select-none">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-xs font-bold text-slate-800 truncate">{currentUser.name}</span>
                <span className="text-[9.5px] text-slate-500 truncate mt-0.5">{currentUser.email}</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {onShowMobileHelp && (
                <button
                  type="button"
                  onClick={onShowMobileHelp}
                  className="text-indigo-500 hover:text-indigo-700 p-2 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
                  title="Mobile Download & PWA Installer"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="text-slate-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition-colors cursor-pointer"
                title="Switch E2EE Identity certificate"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Lock, 
  Unlock, 
  UserPlus, 
  ShieldCheck, 
  AlertTriangle, 
  User, 
  Terminal, 
  Menu,
  Phone,
  Video,
  ArrowLeft
} from 'lucide-react';
import { Team, User as UserType, ChatRoom } from '../types.js';

interface ChatHeaderProps {
  roomName: string;
  roomDesc: string;
  roomType: 'channel' | 'direct' | 'group' | null;
  activeRoomId: string | null;
  hasAESKey: boolean;
  aesKeyFingerprint: string | null;
  teams: Team[];
  allUsers: UserType[];
  teamKeysRegisteredUsers: string[]; // users who hold this team keys
  onInviteUserToTeam: (userId: string) => void;
  onToggleSecurityPanel: () => void;
  isSecurityPanelOpen: boolean;

  // Group Chat capabilities
  activeRoom?: ChatRoom;
  currentUser?: UserType | null;
  onAddMemberToGroup?: (roomId: string, userId: string) => void;
  onRemoveMemberFromGroup?: (roomId: string, userId: string) => void;
  onSetGroupAdmin?: (roomId: string, userId: string) => void;

  // Call options
  onStartVoiceCall?: () => void;
  onStartVideoCall?: () => void;

  // Mobile Back option
  onBackToSidebar?: () => void;
}

export default function ChatHeader({
  roomName,
  roomDesc,
  roomType,
  activeRoomId,
  hasAESKey,
  aesKeyFingerprint,
  teams,
  allUsers,
  teamKeysRegisteredUsers,
  onInviteUserToTeam,
  onToggleSecurityPanel,
  isSecurityPanelOpen,
  activeRoom,
  currentUser,
  onAddMemberToGroup,
  onRemoveMemberFromGroup,
  onSetGroupAdmin,
  onStartVoiceCall,
  onStartVideoCall,
  onBackToSidebar
}: ChatHeaderProps) {
  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  // Derive Team if activeRoom is a channel
  const activeTeam = teams.find(t => t.channels.some(c => c.id === activeRoomId));

  // Find remaining users who do NOT have key for this Team
  const nonKeyHolders = activeTeam 
    ? allUsers.filter(u => !teamKeysRegisteredUsers.includes(u.id))
    : [];

  const handleInviteSelected = (userId: string) => {
    onInviteUserToTeam(userId);
    setShowInviteMenu(false);
  };

  // Group selectors
  const nonMembers = allUsers.filter(u => activeRoom && activeRoom.memberIds && !activeRoom.memberIds.includes(u.id));
  const members = allUsers.filter(u => activeRoom && activeRoom.memberIds && activeRoom.memberIds.includes(u.id));
  const isGroupAdmin = activeRoom && currentUser && activeRoom.adminId === currentUser.id;

  return (
    <div className="h-[72px] border-b border-[#e5e7eb] bg-white px-3 sm:px-6 flex items-center justify-between shrink-0 select-none shadow-xs" id="chat-header">
      {/* Target Title & Description */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {onBackToSidebar && (
          <button
            type="button"
            onClick={onBackToSidebar}
            className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#6264A7] hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer shrink-0"
            title="Back to Workspaces"
            id="header-btn-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <span className="font-bold text-slate-800 text-[15px] sm:text-[17px] tracking-tight truncate">
              {roomType === 'channel' ? `# ${roomName}` : roomName}
            </span>
            <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold tracking-wider uppercase border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 shrink-0">
              {roomType || 'Workspace'}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 truncate w-24 sm:w-64 md:w-auto leading-none mt-1 sm:mt-1.5">
            {roomDesc || 'Shared zero-knowledge dialogue room.'}
          </p>
        </div>
      </div>

      {/* Security Actions & Key Synclink */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Encryption Status badge inspired by Design HTML */}
        <div 
          onClick={onToggleSecurityPanel}
          className={`cursor-pointer px-3 py-1 rounded-full flex items-center gap-1.5 transition-all text-[11px] font-bold uppercase tracking-wider border ${
            hasAESKey 
              ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46] hover:bg-[#d1fae5]' 
              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
          }`}
          title={hasAESKey ? "End-to-End Encrypted Session Active" : "Encryption Signature Keys Lost!"}
        >
          {hasAESKey ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Encrypted</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
              <span>Keys Lost</span>
            </>
          )}

          {aesKeyFingerprint && (
            <span className="font-mono text-[9px] opacity-75 shrink-0 bg-white/60 px-1 py-0.5 rounded border border-emerald-600/10 hidden md:inline ml-1 font-bold">
              ID: {aesKeyFingerprint}
            </span>
          )}
        </div>

        {/* Invite Users to E2EE Group (Team Channels Context only) */}
        {roomType === 'channel' && activeTeam && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowInviteMenu(!showInviteMenu)}
              className="p-1.5 px-3 rounded bg-[#6264A7] hover:bg-[#525493] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Invite Key</span>
            </button>

            {showInviteMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-[#d1d5db] rounded-lg shadow-xl py-2.5 z-50 flex flex-col gap-1 max-h-60 overflow-y-auto">
                <div className="px-3.5 py-1.5 font-bold text-[10px] text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-2">
                  Distribute Workspace Key ({nonKeyHolders.length})
                </div>
                {nonKeyHolders.length === 0 ? (
                  <p className="px-3.5 py-2 text-slate-400 text-[11px] italic">All network members already hold keys to this team workspace.</p>
                ) : (
                  nonKeyHolders.map(user => (
                    <div
                      key={user.id}
                      onClick={() => handleInviteSelected(user.id)}
                      className="px-3.5 py-2 hover:bg-[#f9fafb] hover:text-[#6264A7] cursor-pointer flex items-center justify-between text-xs transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-700 truncate">{user.name}</span>
                        <span className="text-[10px] text-slate-450 truncate">{user.email}</span>
                      </div>
                      <span className="text-[9px] text-[#6264A7] font-bold tracking-wider uppercase bg-[#edeef7] px-1.5 py-0.5 rounded">SHARE</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Manage E2EE Group (Group Chat Context only) */}
        {roomType === 'group' && activeRoom && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowGroupMenu(!showGroupMenu);
                setShowInviteMenu(false); // close the other menu if open
              }}
              className="p-1.5 px-2 sm:px-3 rounded bg-[#6264A7] hover:bg-[#525493] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Manage Group</span>
            </button>

            {showGroupMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-[#d1d5db] rounded-xl shadow-xl py-3 z-50 flex flex-col gap-3">
                <div className="px-4 py-1.5 font-bold text-[10px] text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-2">
                  E2EE Group Participants ({members.length})
                </div>

                {/* List participants */}
                <div className="px-4 max-h-40 overflow-y-auto flex flex-col gap-1.5">
                  {members.map(member => {
                    const isMemberAdmin = activeRoom.adminId === member.id;
                    return (
                      <div key={member.id} className="flex items-center justify-between gap-1.5 py-1">
                        <div className="flex flex-col min-w-0 max-w-[150px]">
                          <span className="font-bold text-slate-700 text-xs truncate">{member.name}</span>
                          <span className="text-[9.5px] text-slate-450 truncate">{member.email}</span>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          {isMemberAdmin && (
                            <span className="text-[8.5px] bg-[#6264A7]/10 text-[#6264A7] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-95 border border-[#6264A7]/20">
                              Admin
                            </span>
                          )}

                          {isGroupAdmin && !isMemberAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => onSetGroupAdmin && onSetGroupAdmin(activeRoom.id, member.id)}
                                className="text-[9px] text-[#6264A7] hover:underline hover:bg-[#edeef7] px-1.5 py-1 rounded"
                                title="Appoint administrator"
                              >
                                Set Admin
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveMemberFromGroup && onRemoveMemberFromGroup(activeRoom.id, member.id)}
                                className="text-[9px] text-red-600 hover:bg-red-50 hover:text-red-750 px-1.5 py-1 rounded font-bold"
                                title="Exclude from workspace"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add new participant */}
                <div className="border-t border-slate-150 pt-2.5 px-4 flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
                    Add Participant:
                  </div>
                  {!hasAESKey ? (
                    <p className="text-[10px] text-amber-600 font-semibold italic bg-amber-50 rounded p-1 border border-amber-100">
                      Cannot add members: you do not hold this room's E2EE symmetric key. Claim keys first.
                    </p>
                  ) : nonMembers.length === 0 ? (
                    <p className="text-[10.5px] text-slate-400 italic">All contacts are already added to this group.</p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto flex flex-col border border-slate-100 rounded">
                      {nonMembers.map(u => (
                        <div
                          key={u.id}
                          onClick={() => {
                            if (onAddMemberToGroup) {
                              onAddMemberToGroup(activeRoom.id, u.id);
                            }
                          }}
                          className="px-2.5 py-1.5 hover:bg-[#f9fafb] hover:text-[#6264A7] cursor-pointer text-xs font-semibold flex justify-between items-center transition-colors border-b border-slate-50 last:border-0"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="leading-tight text-[11px] truncate">{u.name}</span>
                            <span className="text-[9px] text-slate-400 leading-tight truncate">{u.email}</span>
                          </div>
                          <span className="text-[9px] font-bold text-[#6264A7] uppercase bg-[#edeef7] px-1.5 py-0.5 rounded shrink-0 scale-90">
                            ADD
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Calling Actions */}
        {activeRoomId && (
          <>
            <button
              type="button"
              onClick={onStartVoiceCall}
              className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-[#6264A7] hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer"
              title="Secure Voice Call (E2EE)"
              id="header-btn-voice-call"
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onStartVideoCall}
              className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-[#6264A7] hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer"
              title="Secure Video Call (E2EE)"
              id="header-btn-video-call"
            >
              <Video className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Toggle Security sidebar panel */}
        <button
          type="button"
          onClick={onToggleSecurityPanel}
          className={`rounded border transition-all p-1.5 sm:p-2 cursor-pointer ${
            isSecurityPanelOpen 
              ? 'bg-[#edeef7] border-[#6264A7]/30 text-[#6264A7]' 
              : 'border-slate-200 text-slate-600 hover:text-[#6264A7] hover:bg-slate-50'
          }`}
          title="Toggle Cryptography Console"
          id="header-btn-security"
        >
          <Terminal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {stableStringify} from '../../shared/engine/serialization.mjs';

function parseJson(value){
  return value ? JSON.parse(String(value)) : null;
}

export class SQLiteAuthorityStore {
  constructor(filePath){
    const resolved = path.resolve(String(filePath || 'data/fate-authority-v3.sqlite'));
    fs.mkdirSync(path.dirname(resolved), {recursive:true});
    this.filePath = resolved;
    this.db = new DatabaseSync(resolved);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS matches (
        match_id TEXT PRIMARY KEY,
        engine_version TEXT NOT NULL,
        ruleset_version TEXT NOT NULL,
        current_revision INTEGER NOT NULL,
        current_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        PRIMARY KEY(match_id, player_id),
        UNIQUE(match_id, seat),
        FOREIGN KEY(match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS commands (
        match_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        command_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        command_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        accepted_at INTEGER NOT NULL,
        PRIMARY KEY(match_id, revision),
        UNIQUE(match_id, command_id),
        FOREIGN KEY(match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        match_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(match_id, revision),
        FOREIGN KEY(match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS beta_matchmaking_queue (
        player_id TEXT PRIMARY KEY,
        entry_json TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS beta_matchmaking_deliveries (
        player_id TEXT PRIMARY KEY,
        credential_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS commands_match_command
        ON commands(match_id, command_id);
      CREATE INDEX IF NOT EXISTS commands_match_revision
        ON commands(match_id, revision);
    `);
  }

  close(){
    this.db.close();
  }

  loadBetaMatchmakingQueue(){
    return this.db.prepare(`
      SELECT player_id AS playerId, entry_json AS entryJson, last_seen_at AS lastSeenAt
      FROM beta_matchmaking_queue
      ORDER BY joined_at, player_id
    `).all().map(row=>{
      const entry = parseJson(row.entryJson);
      if(entry) entry.lastSeenAt = Math.max(1, Number(row.lastSeenAt) || Number(entry.lastSeenAt) || Date.now());
      return {playerId:String(row.playerId || ''), entry};
    }).filter(row=>row.playerId && row.entry);
  }

  upsertBetaMatchmakingEntry(entry){
    const playerId = String(entry?.uid || '');
    if(!playerId) throw new Error('beta matchmaking player id is required');
    const joinedAt = Math.max(1, Number(entry.joinedAt) || Date.now());
    const lastSeenAt = Math.max(joinedAt, Number(entry.lastSeenAt) || joinedAt);
    this.db.prepare(`
      INSERT INTO beta_matchmaking_queue(player_id, entry_json, joined_at, last_seen_at)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        entry_json = excluded.entry_json,
        joined_at = excluded.joined_at,
        last_seen_at = excluded.last_seen_at
    `).run(playerId, stableStringify(entry), joinedAt, lastSeenAt);
  }

  touchBetaMatchmakingEntry(playerId, lastSeenAt = Date.now()){
    const id = String(playerId || '');
    if(!id) return 0;
    return this.db.prepare(`
      UPDATE beta_matchmaking_queue
      SET last_seen_at = ?
      WHERE player_id = ?
    `).run(Math.max(1, Number(lastSeenAt) || Date.now()), id).changes;
  }

  deleteBetaMatchmakingEntry(playerId){
    const id = String(playerId || '');
    if(!id) return 0;
    return this.db.prepare('DELETE FROM beta_matchmaking_queue WHERE player_id = ?').run(id).changes;
  }

  loadBetaMatchmakingDeliveries(){
    return this.db.prepare(`
      SELECT player_id AS playerId, credential_json AS credentialJson
      FROM beta_matchmaking_deliveries
      ORDER BY created_at, player_id
    `).all().map(row=>({
      playerId:String(row.playerId || ''),
      credential:parseJson(row.credentialJson)
    })).filter(row=>row.playerId && row.credential);
  }

  upsertBetaMatchmakingDelivery(playerId, credential){
    const id = String(playerId || '');
    if(!id || !credential) throw new Error('beta matchmaking delivery is invalid');
    this.db.prepare(`
      INSERT INTO beta_matchmaking_deliveries(player_id, credential_json, created_at)
      VALUES(?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        credential_json = excluded.credential_json,
        created_at = excluded.created_at
    `).run(id, stableStringify(credential), Date.now());
  }

  deleteBetaMatchmakingDelivery(playerId){
    const id = String(playerId || '');
    if(!id) return 0;
    return this.db.prepare('DELETE FROM beta_matchmaking_deliveries WHERE player_id = ?').run(id).changes;
  }

  rollbackIfActive(){
    // SQLite can end a transaction itself after some I/O failures. Never
    // replace the actionable storage error with "no transaction is active".
    if(this.db.isTransaction) this.db.exec('ROLLBACK');
  }

  pruneOldMatches({keepMostRecent = 50, excludeMatchIds = [], batchSize = 25} = {}){
    const keep = Math.max(1, Number(keepMostRecent) || 50);
    const batch = Math.max(1, Math.min(100, Number(batchSize) || 25));
    const excluded = new Set((excludeMatchIds || []).map(String).filter(Boolean));
    const deleted = [];
    const remove = this.db.prepare('DELETE FROM matches WHERE match_id = ?');
    while(true){
      const candidates = this.db.prepare(`
        SELECT match_id AS matchId
        FROM matches
        ORDER BY updated_at DESC, match_id DESC
        LIMIT -1 OFFSET ?
      `).all(keep)
        .map(row=>String(row.matchId || ''))
        .filter(matchId=>matchId && !excluded.has(matchId))
        .slice(0, batch);
      if(!candidates.length) break;
      this.db.exec('BEGIN IMMEDIATE');
      try{
        for(const matchId of candidates) remove.run(matchId);
        this.db.exec('COMMIT');
      }catch(error){
        this.rollbackIfActive();
        throw error;
      }
      deleted.push(...candidates);
      // Keep each delete batch's WAL bounded so cleanup itself cannot consume
      // the last free bytes on a nearly-full Fly volume.
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    return deleted;
  }

  createMatch(state, stateHash, playerCredentials){
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare(`
        INSERT INTO matches(
          match_id, engine_version, ruleset_version, current_revision,
          current_hash, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?)
      `).run(
        state.matchId,
        state.engineVersion,
        state.rulesetVersion,
        state.revision,
        stateHash,
        now,
        now
      );
      const insertPlayer = this.db.prepare(`
        INSERT INTO match_players(match_id, player_id, seat, token_hash)
        VALUES(?, ?, ?, ?)
      `);
      for(const credential of playerCredentials){
        insertPlayer.run(state.matchId, credential.playerId, credential.seat, credential.tokenHash);
      }
      this.db.prepare(`
        INSERT INTO snapshots(match_id, revision, state_json, state_hash, created_at)
        VALUES(?, ?, ?, ?, ?)
      `).run(state.matchId, state.revision, stableStringify(state), stateHash, now);
      this.db.exec('COMMIT');
    }catch(error){
      this.rollbackIfActive();
      throw error;
    }
  }

  hasMatch(matchId){
    return !!this.db.prepare('SELECT 1 AS present FROM matches WHERE match_id = ?').get(matchId);
  }

  playerCredential(matchId, playerId){
    return this.db.prepare(`
      SELECT player_id AS playerId, seat, token_hash AS tokenHash
      FROM match_players
      WHERE match_id = ? AND player_id = ?
    `).get(matchId, playerId) || null;
  }

  playerCredentials(matchId){
    return this.db.prepare(`
      SELECT player_id AS playerId, seat, token_hash AS tokenHash
      FROM match_players
      WHERE match_id = ?
      ORDER BY seat
    `).all(matchId);
  }

  commandResponse(matchId, commandId){
    const row = this.db.prepare(`
      SELECT
        player_id AS playerId,
        command_json AS commandJson,
        response_json AS responseJson
      FROM commands
      WHERE match_id = ? AND command_id = ?
    `).get(matchId, commandId);
    return row ? {
      playerId:row.playerId,
      command:parseJson(row.commandJson),
      response:parseJson(row.responseJson)
    } : null;
  }

  appendAccepted({state, stateHash, command, playerId, response, snapshot}){
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const metadata = this.db.prepare(`
        SELECT current_revision AS currentRevision
        FROM matches
        WHERE match_id = ?
      `).get(state.matchId);
      if(!metadata) throw new Error('match metadata is missing');
      if(Number(metadata.currentRevision) !== Number(state.revision) - 1){
        throw new Error('persistence revision changed before command commit');
      }
      this.db.prepare(`
        INSERT INTO commands(
          match_id, revision, command_id, player_id, command_json,
          response_json, state_hash, accepted_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        state.matchId,
        state.revision,
        command.commandId,
        playerId,
        stableStringify(command),
        stableStringify(response),
        stateHash,
        now
      );
      this.db.prepare(`
        UPDATE matches
        SET current_revision = ?, current_hash = ?, updated_at = ?
        WHERE match_id = ?
      `).run(state.revision, stateHash, now, state.matchId);
      if(snapshot){
        this.db.prepare(`
          INSERT INTO snapshots(match_id, revision, state_json, state_hash, created_at)
          VALUES(?, ?, ?, ?, ?)
        `).run(state.matchId, state.revision, stableStringify(state), stateHash, now);
        this.db.prepare(`
          DELETE FROM snapshots
          WHERE match_id = ?
            AND revision NOT IN (
              SELECT revision
              FROM snapshots
              WHERE match_id = ?
              ORDER BY revision DESC
              LIMIT 3
            )
        `).run(state.matchId, state.matchId);
      }
      this.db.exec('COMMIT');
    }catch(error){
      this.rollbackIfActive();
      throw error;
    }
  }

  loadRecovery(matchId){
    const metadata = this.db.prepare(`
      SELECT
        match_id AS matchId,
        engine_version AS engineVersion,
        ruleset_version AS rulesetVersion,
        current_revision AS currentRevision,
        current_hash AS currentHash
      FROM matches
      WHERE match_id = ?
    `).get(matchId);
    if(!metadata) return null;
    const snapshotRow = this.db.prepare(`
      SELECT revision, state_json AS stateJson, state_hash AS stateHash
      FROM snapshots
      WHERE match_id = ?
      ORDER BY revision DESC
      LIMIT 1
    `).get(matchId);
    if(!snapshotRow) throw new Error('recovery snapshot is missing');
    const commands = this.db.prepare(`
      SELECT
        revision,
        command_id AS commandId,
        player_id AS playerId,
        command_json AS commandJson,
        response_json AS responseJson,
        state_hash AS stateHash
      FROM commands
      WHERE match_id = ? AND revision > ?
      ORDER BY revision
    `).all(matchId, snapshotRow.revision).map(row=>({
      revision:Number(row.revision),
      commandId:row.commandId,
      playerId:row.playerId,
      command:parseJson(row.commandJson),
      response:parseJson(row.responseJson),
      stateHash:row.stateHash
    }));
    return {
      metadata,
      snapshot:{
        revision:Number(snapshotRow.revision),
        state:parseJson(snapshotRow.stateJson),
        stateHash:snapshotRow.stateHash
      },
      commands
    };
  }

  pruneCommandLogs(retentionDays){
    const days = Math.max(1, Number(retentionDays || 30) || 30);
    const cutoff = Date.now() - days * 86400000;
    return this.db.prepare(`
      DELETE FROM commands
      WHERE accepted_at < ?
        AND revision <= COALESCE((
          SELECT MAX(s.revision)
          FROM snapshots AS s
          WHERE s.match_id = commands.match_id
        ), -1)
        AND match_id IN (
          SELECT match_id FROM matches WHERE updated_at < ?
        )
    `).run(cutoff, cutoff).changes;
  }
}

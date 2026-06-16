-- episodic: agent's flat notebook — one row per stored episodic memory.
create table if not exists episodic (
  id          integer primary key autoincrement,
  agent       text not null,
  name        text not null,
  data        text not null,
  metadata    text,
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

-- episodic_fts: FTS5 search index over episodic.data.
create virtual table if not exists episodic_fts using fts5(
  data,
  content='episodic',
  content_rowid='id'
);

-- on insert into episodic, mirror the row into the FTS5 index.
create trigger if not exists episodic_sync_fts_on_insert
  after insert on episodic
begin
  insert into episodic_fts (rowid, data)
  values (new.id, new.data);
end;

-- on delete from episodic, remove the row from the FTS5 index.
create trigger if not exists episodic_sync_fts_on_delete
  after delete on episodic
begin
  insert into episodic_fts (episodic_fts, rowid, data)
  values ('delete', old.id, old.data);
end;

-- on update of episodic, replace the FTS5 index.
create trigger if not exists episodic_sync_fts_on_update
  after update on episodic
begin
  insert into episodic_fts (episodic_fts, rowid, data)
  values ('delete', old.id, old.data);

  insert into episodic_fts (rowid, data)
  values (new.id, new.data);
end;

-- semantic: agent's stable domain facts — one row per stored semantic memory.
create table if not exists semantic (
  id          integer primary key autoincrement,
  agent       text not null,
  name        text not null,
  data        text not null,
  metadata    text,
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

-- semantic_fts: FTS5 search index over semantic.data.
create virtual table if not exists semantic_fts using fts5(
  data,
  content='semantic',
  content_rowid='id'
);

-- on insert into semantic, mirror the row into the FTS5 index.
create trigger if not exists semantic_sync_fts_on_insert
  after insert on semantic
begin
  insert into semantic_fts (rowid, data)
  values (new.id, new.data);
end;

-- on delete from semantic, remove the row from the FTS5 index.
create trigger if not exists semantic_sync_fts_on_delete
  after delete on semantic
begin
  insert into semantic_fts (semantic_fts, rowid, data)
  values ('delete', old.id, old.data);
end;

-- on update of semantic, replace the FTS5 index.
create trigger if not exists semantic_sync_fts_on_update
  after update on semantic
begin
  insert into semantic_fts (semantic_fts, rowid, data)
  values ('delete', old.id, old.data);

  insert into semantic_fts (rowid, data)
  values (new.id, new.data);
end;

-- world: shared knowledge base — singular source of truth across all agents.
create table if not exists world (
  id          integer primary key autoincrement,
  name        text not null,
  data        text not null,
  metadata    text,
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

-- world_fts: FTS5 search index over world.data.
create virtual table if not exists world_fts using fts5(
  data,
  content='world',
  content_rowid='id'
);

-- on insert into world, mirror the row into the FTS5 index.
create trigger if not exists world_sync_fts_on_insert
  after insert on world
begin
  insert into world_fts (rowid, data)
  values (new.id, new.data);
end;

-- on delete from world, remove the row from the FTS5 index.
create trigger if not exists world_sync_fts_on_delete
  after delete on world
begin
  insert into world_fts (world_fts, rowid, data)
  values ('delete', old.id, old.data);
end;

-- on update of world, replace the FTS5 index (covers world_update).
create trigger if not exists world_sync_fts_on_update
  after update on world
begin
  insert into world_fts (world_fts, rowid, data)
  values ('delete', old.id, old.data);

  insert into world_fts (rowid, data)
  values (new.id, new.data);
end;

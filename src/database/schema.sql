-- memories: agent's flat notebook — one row per stored agent's note.
create table if not exists memories (
  id          integer primary key autoincrement,
  agent       text not null,
  data        text not null,
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

-- memories_fts: FTS5 search index over memories.data.
create virtual table if not exists memories_fts using fts5(
  data,
  content='memories',
  content_rowid='id'
);

-- on insert into memories, mirror the row into the FTS5 index.
create trigger if not exists memories_sync_fts_on_insert
  after insert on memories
begin
  insert into memories_fts (rowid, data)
  values (new.id, new.data);
end;

-- on delete from memories, remove the row from the FTS5 index.
create trigger if not exists memories_sync_fts_on_delete
  after delete on memories
begin
  insert into memories_fts (memories_fts, rowid, data)
  values ('delete', old.id, old.data);
end;

-- on update of memories, replace the FTS5 index entry (delete old values, insert new ones).
create trigger if not exists memories_sync_fts_on_update
  after update on memories
begin
  insert into memories_fts (memories_fts, rowid, data)
  values ('delete', old.id, old.data);

  insert into memories_fts (rowid, data)
  values (new.id, new.data);
end;

create index idx_tags_created_by on public.tags(created_by);
create index idx_entity_tags_created_by on public.entity_tags(created_by);
create index idx_custom_field_definitions_created_by on public.custom_field_definitions(created_by);
create index idx_custom_field_values_created_by on public.custom_field_values(created_by);
create index idx_custom_field_values_updated_by on public.custom_field_values(updated_by);

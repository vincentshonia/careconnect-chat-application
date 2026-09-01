CREATE POLICY "Staff read own avatar files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staff-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff upload own avatar files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff update own avatar files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'staff-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'staff-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff delete own avatar files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'staff-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
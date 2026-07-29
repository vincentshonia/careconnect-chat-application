CREATE POLICY "Staff can view own org branding"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'branding' AND public.can_access_org(((storage.foldername(name))[1])::uuid));

CREATE POLICY "Staff can upload own org branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.can_access_org(((storage.foldername(name))[1])::uuid));

CREATE POLICY "Staff can update own org branding"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND public.can_access_org(((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'branding' AND public.can_access_org(((storage.foldername(name))[1])::uuid));

CREATE POLICY "Staff can delete own org branding"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND public.can_access_org(((storage.foldername(name))[1])::uuid));
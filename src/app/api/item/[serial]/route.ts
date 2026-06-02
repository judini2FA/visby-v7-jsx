import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    _req: Request,
    { params }: { params: { serial: string } }
  ) {
    try {
          const supabase = await createClient();
          const { data, error } = await supabase
            .from('items')
            .select(`
                            *,
                            ownership_history (*)
                          `)
            .eq('serial_number', params.serial)
            .order('created_at', { referencedTable: 'ownership_history', ascending: true })
            .single();

          if (error) {
                  return NextResponse.json({ error: 'Item not found' }, { status: 404 });
                }

          return NextResponse.json(data);
        } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
        }
  }

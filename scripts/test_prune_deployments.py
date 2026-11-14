import unittest
from prune_deployments import plan

class PlanTests(unittest.TestCase):
    def test_preserves_recent_active_unknown_and_other_environments(self):
        ds=[{'id':i,'created_at':f'2026-11-{i:02}T00:00:00Z','environment':'github-pages'} for i in range(1,16)]
        ds.append({'id':99,'created_at':'2026-11-30','environment':'other'})
        states={1:'inactive',2:'inactive',3:'success',4:None,5:'queued'}
        pages,recent,candidates,protected=plan(ds,lambda d:states.get(d['id'],'inactive'))
        self.assertEqual(15,len(pages));self.assertEqual(list(range(15,5,-1)),[x['id'] for x in recent])
        self.assertEqual([2,1],[x['id'] for x in candidates]);self.assertEqual([5,4,3],[x['id'] for x in protected])
    def test_small_history_never_deleted(self):
        ds=[{'id':1,'environment':'github-pages','created_at':'x'}]
        self.assertEqual([],plan(ds,lambda d:'inactive')[2])
    def test_no_other_environments(self):
        self.assertEqual([],plan([{'id':9,'environment':'other'}],lambda d:'inactive')[0])
if __name__=='__main__':unittest.main()

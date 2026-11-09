import { Routes } from '@angular/router';
import { Account } from './pages/account';
import { Home } from './pages/home';
import { Ranking } from './pages/ranking';

export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full' },
  { path: 'ranking', component: Ranking, title: 'Ranking · Dark Souls Challenge' },
  { path: 'account', component: Account, title: 'Account · Dark Souls Challenge' },
  { path: '**', redirectTo: '' },
];

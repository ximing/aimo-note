import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';

export const SearchPage = observer(() => {
  const navigate = useNavigate();
  const uiService = useService(UIService);

  useEffect(() => {
    // Redirect to home and open search in sidebar
    uiService.setSidebarView('search');
    navigate('/', { replace: true });
  }, [navigate, uiService]);

  return null;
});

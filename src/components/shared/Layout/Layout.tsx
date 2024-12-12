import { FC, useEffect, useState } from 'react';
import s from './Layout.module.scss';

interface Props {
  className?: string;
  children: React.ReactNode;
}
export const Layout: FC<Props> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const setViewportHeight = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  useEffect(() => {
    setIsLoaded(true);
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    return () => {
      window.removeEventListener('resize', setViewportHeight);
    };
  }, []);

  if (!isLoaded) {
    return <></>;
  }
  return (
    <>
      <main className={s.root}>{children}</main>
    </>
  );
};

export default Layout;

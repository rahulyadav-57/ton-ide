import { Tooltip as TooltipAntd } from 'antd';
import { TooltipPlacement } from 'antd/es/tooltip';
import { FC, useState } from 'react';

interface Props {
  title: string;
  placement?: TooltipPlacement;
  children: React.ReactNode;
}
const Tooltip: FC<Props> = ({ title, placement, children }) => {
  const [visible, setVisible] = useState(false);

  const handleVisibleChange = (newVisible: boolean) => {
    setVisible(newVisible);
    // Set a timeout to auto-hide the tooltip on mobile
    if (newVisible && window.innerWidth <= 767) {
      setTimeout(() => {
        setVisible(false);
      }, 1000);
    }
  };
  return (
    <TooltipAntd
      placement={placement}
      title={title}
      open={visible}
      onOpenChange={handleVisibleChange}
    >
      {children}
    </TooltipAntd>
  );
};

export default Tooltip;

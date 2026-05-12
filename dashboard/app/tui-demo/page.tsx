'use client';

import * as React from 'react';

import ActionBar from '@components/ActionBar';
import AlertBanner from '@components/AlertBanner';
import Badge from '@components/Badge';
import BarProgress from '@components/BarProgress';
import Button from '@components/Button';
import ButtonGroup from '@components/ButtonGroup';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Checkbox from '@components/Checkbox';
import DataTable from '@components/DataTable';
import Dialog from '@components/Dialog';
import Input from '@components/Input';
import Navigation from '@components/Navigation';
import RadioButtonGroup from '@components/RadioButtonGroup';
import Tooltip from '@components/Tooltip';
import Window from '@components/Window';

const SAMPLE_TABLE: string[][] = [
  ['ID', 'AGENT', 'STATUS', 'TOKENS'],
  ['001', 'Frontend', 'idle', '12,840'],
  ['002', 'Backend', 'busy', '31,205'],
  ['003', 'Validator', 'idle', '4,012'],
  ['004', 'Researcher', 'busy', '88,401'],
];

export default function TuiDemoPage() {
  return (
    <main style={{ padding: '2ch' }}>
      <h1>TUI KITCHEN SINK</h1>
      <p>
        Visual sanity surface for the TUI component library. Renders {/* */}
        a representative slice of the component library wired through the
        <code> @components/*</code> alias.
      </p>
      <br />

      <h2>Buttons</h2>
      <Card title="BUTTONS">
        <Button>Primary Button</Button>
        <br />
        <Button theme="SECONDARY">Secondary Button</Button>
        <br />
        <Button isDisabled>Disabled Button</Button>
      </Card>
      <br />
      <Card title="BUTTON GROUP">
        <ButtonGroup
          items={[
            { body: '16 PX', selected: true },
            { body: '32 PX' },
            { body: '42 PX' },
          ]}
        />
        <br />
        <ButtonGroup
          isFull
          items={[
            { body: 'ONE', selected: true },
            { body: 'TWO' },
            { body: 'THREE' },
          ]}
        />
      </Card>
      <br />

      <h2>Inputs</h2>
      <Card title="TEXT INPUTS">
        <Input
          autoComplete="off"
          isBlink={false}
          label="USERNAME"
          placeholder="Choose a username"
          name="demo_username"
        />
        <Input
          autoComplete="off"
          isBlink={false}
          label="PASSWORD"
          type="password"
          placeholder="8+ characters"
          name="demo_password"
        />
      </Card>
      <br />
      <Card title="CHECKBOX">
        <Checkbox name="demo_terms_1">
          I agree to the Terms of Service.
        </Checkbox>
        <Checkbox name="demo_terms_2">
          I agree not to use this service for unlawful purposes.
        </Checkbox>
      </Card>
      <br />
      <Card title="RADIO GROUP">
        <RadioButtonGroup
          defaultValue="demo_personal"
          options={[
            { value: 'demo_personal', label: 'Personal use.' },
            { value: 'demo_work', label: 'Work / building something.' },
            { value: 'demo_team', label: 'Team or organization.' },
          ]}
        />
      </Card>
      <br />

      <h2>Status &amp; Feedback</h2>
      <Card title="BADGE">
        Component status <Badge>stable</Badge>{' '}
        <Badge>v0.1</Badge>
      </Card>
      <br />
      <Card title="ALERT BANNER">
        <AlertBanner>
          When things reach the extreme, they alternate to the opposite.
        </AlertBanner>
      </Card>
      <br />
      <Card title="BAR PROGRESS">
        <BarProgress progress={0} />
        <br />
        <BarProgress progress={25} />
        <br />
        <BarProgress progress={50} />
        <br />
        <BarProgress progress={75} />
        <br />
        <BarProgress progress={100} />
      </Card>
      <br />

      <h2>Data</h2>
      <Card title="DATA TABLE">
        <DataTable data={SAMPLE_TABLE} />
      </Card>
      <br />

      <h2>Layout</h2>
      <CardDouble title="CARD DOUBLE">
        A double-bordered card variant. Wrap any content section to give it
        elevated weight relative to a regular Card.
      </CardDouble>
      <br />
      <Window>
        <Card title="WINDOW EXAMPLE" mode="left">
          This card sits inside a &lt;Window&gt; — body uses the window
          theme background and gains a 1ch right + 1 row bottom drop shadow.
        </Card>
      </Window>
      <br />

      <h2>Overlays</h2>
      <Card title="DIALOG">
        <Dialog title="FAREWELL">
          There are unsaved changes.
          <br />
          Are you sure you want to start over?
        </Dialog>
      </Card>
      <br />
      <Card title="TOOLTIP">
        {/* TODO: Tooltip is a passive <div>; in the TUI reference it is
            anchored via HoverComponentTrigger. Rendering inline as a static
            preview here for the kitchen-sink. */}
        <Tooltip>The future depends on what we do in the present.</Tooltip>
      </Card>
      <br />

      <h2>Action / Navigation</h2>
      <Card title="ACTION BAR">
        <ActionBar
          items={[
            { hotkey: '⌘+1', body: 'Example I' },
            { hotkey: '⌘+2', body: 'Example II' },
            { hotkey: '⌘+3', body: 'Example III' },
          ]}
        />
      </Card>
      <br />
      <Card title="NAVIGATION">
        {/* TODO: Navigation in TUI uses ModalTrigger + ActionButton for
            its left/right slots. Using plain text here to keep the demo
            self-contained. */}
        <Navigation logo="✶" left={<span>SETUP</span>} right={<span>SIGN IN</span>}>
          <span>HOME</span>
        </Navigation>
      </Card>
    </main>
  );
}

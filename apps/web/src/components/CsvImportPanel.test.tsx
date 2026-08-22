import {describe, expect, it, jest} from '@jest/globals';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PILE_TYPE_CSV_EXAMPLE,
  VEHICLE_CSV_EXAMPLE,
  parsePileTypeRows,
  parseVehicleRows,
} from '@pile-on/core';
import {CsvImportPanel} from './CsvImportPanel';

function renderPanel(onImport = jest.fn()) {
  render(
    <CsvImportPanel
      label="pile types"
      example={PILE_TYPE_CSV_EXAMPLE}
      parseRows={parsePileTypeRows}
      onImport={onImport as never}
    />,
  );
  return onImport;
}

describe('CsvImportPanel', () => {
  it('imports well-formed pasted rows', async () => {
    const user = userEvent.setup();
    const onImport = renderPanel();

    await user.click(screen.getByText(/Import pile types from CSV/));
    await user.click(screen.getByRole('button', {name: 'Fill with example'}));
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(onImport).toHaveBeenCalledTimes(1);
    const [items, replace] = onImport.mock.calls[0] as [unknown[], boolean];
    expect(items).toHaveLength(2);
    expect(replace).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Imported 2 rows.');
  });

  it('reports every bad row instead of importing', async () => {
    const user = userEvent.setup();
    const onImport = renderPanel();

    await user.click(screen.getByText(/Import pile types from CSV/));
    await user.type(
      screen.getByLabelText('pile types CSV text'),
      'id,name,length,shaft_radius,mass\nA,A,nope,84,178\n,B,6000,84,178',
    );
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(onImport).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByText(/This CSV was not imported \(2\)/),
    ).toBeInTheDocument();
    expect(within(alert).getByText('row 1 / length')).toBeInTheDocument();
    expect(within(alert).getByText('row 2 / id')).toBeInTheDocument();
  });

  it('passes the replace choice through', async () => {
    const user = userEvent.setup();
    const onImport = renderPanel();

    await user.click(screen.getByText(/Import pile types from CSV/));
    await user.click(
      screen.getByRole('radio', {name: /Replace the whole list/}),
    );
    await user.click(screen.getByRole('button', {name: 'Fill with example'}));
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect((onImport.mock.calls[0] as [unknown, boolean])[1]).toBe(true);
  });

  it('accepts tab-separated text pasted out of a spreadsheet', async () => {
    const user = userEvent.setup();
    const onImport = renderPanel();

    await user.click(screen.getByText(/Import pile types from CSV/));
    await user.type(
      screen.getByLabelText('pile types CSV text'),
      'id\tname\tlength\tshaft_radius\tmass\nA\tPile A\t6000\t84\t178',
    );
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(
      (onImport.mock.calls[0] as [{id: string}[], boolean])[0][0]!.id,
    ).toBe('A');
  });

  it('leaves the import button disabled until there is something to import', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText(/Import pile types from CSV/));

    expect(
      screen.getByRole('button', {name: 'Import pasted rows'}),
    ).toBeDisabled();
  });

  it('works for vehicles too — the panel knows nothing about the domain', async () => {
    const user = userEvent.setup();
    const onImport = jest.fn();
    render(
      <CsvImportPanel
        label="vehicles"
        example={VEHICLE_CSV_EXAMPLE}
        parseRows={parseVehicleRows}
        onImport={onImport as never}
      />,
    );

    await user.click(screen.getByText(/Import vehicles from CSV/));
    await user.click(screen.getByRole('button', {name: 'Fill with example'}));
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect((onImport.mock.calls[0] as [unknown[], boolean])[0]).toHaveLength(3);
  });
});
